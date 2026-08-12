import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AxiosError, AxiosHeaders } from 'axios';
import { of, throwError } from 'rxjs';

import type { HttpService } from '@nestjs/axios';
import type { ConfigType } from '@nestjs/config';

import type { AuditService, OutboundEntry } from '../audit/audit.service';
import type { vaultConfig } from './vault.config';
import { VaultService } from './vault.service';

/** Wire-level stub for HttpService.request. Each call invokes `handler` with
 *  the request, which returns either a fake AxiosResponse or throws (to
 *  simulate Vault errors). */
function makeHttp(
  handler: (req: {
    method: string;
    url: string;
    data?: unknown;
  }) => { status: number; data: unknown } | Error,
) {
  const request = jest.fn(
    (req: { method: string; url: string; data?: unknown }) => {
      const out = handler(req);
      if (out instanceof Error) return throwError(() => out);
      return of({
        status: out.status,
        data: out.data,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
      });
    },
  );
  // post is used by the AppRole login path; route it through the same handler.
  const post = jest.fn((url: string, data: unknown) => {
    const out = handler({ method: 'POST', url, data });
    if (out instanceof Error) return throwError(() => out);
    return of({
      status: out.status,
      data: out.data,
      statusText: 'OK',
      headers: {},
      config: { headers: new AxiosHeaders() },
    });
  });
  return { request, post } as unknown as HttpService;
}

function axiosError(status: number, body: unknown): AxiosError {
  const err = new AxiosError('vault test error');
  err.response = {
    status,
    data: body,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  return err;
}

function makeAudit(): {
  service: AuditService;
  rows: OutboundEntry[];
} {
  const rows: OutboundEntry[] = [];
  const service = {
    recordOutbound: jest.fn((e: OutboundEntry) => {
      rows.push(e);
      return Promise.resolve();
    }),
    recordInbound: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;
  return { service, rows };
}

/** Writes role-id / secret-id files to a temp dir and returns a vault config
 *  that points at them. */
function makeConfig(): ConfigType<typeof vaultConfig> {
  const dir = mkdtempSync(join(tmpdir(), 'vault-spec-'));
  const roleIdFile = join(dir, 'role-id');
  const secretIdFile = join(dir, 'secret-id');
  writeFileSync(roleIdFile, 'role-id-value\n');
  writeFileSync(secretIdFile, 'secret-id-value\n');
  return {
    address: 'http://vault.test:8200',
    roleIdFile,
    secretIdFile,
  };
}

const LOGIN_RESPONSE = {
  auth: {
    client_token: 't-1',
    lease_duration: 3600,
    renewable: true,
  },
};

describe('VaultService', () => {
  it('writes branch creds with the secret values elided from the audit row', async () => {
    const handler = jest.fn(
      (req: { method: string; url: string; data?: unknown }) => {
        if (req.url.endsWith('/v1/auth/approle/login')) {
          return { status: 200, data: LOGIN_RESPONSE };
        }
        // ensureMerchantMount: POST /v1/sys/mounts/m-<id>
        if (req.url.includes('/v1/sys/mounts/')) {
          return { status: 204, data: '' };
        }
        // kv-v2 write: POST /v1/m-<id>/data/branches/<id>/eirms
        if (req.method === 'POST' && req.url.includes('/data/branches/')) {
          return { status: 200, data: { data: { version: 1 } } };
        }
        throw new Error(`unexpected vault call: ${req.method} ${req.url}`);
      },
    );
    const http = makeHttp(handler);
    const { service: audit, rows } = makeAudit();
    const svc = new VaultService(makeConfig(), http, audit);

    await svc.writeBranchCreds('merch-1', 'br-1', {
      clientId: 'CID',
      clientSecret: 'CSECRET',
      apikey: 'APIKEY',
    });

    // Find the kv write row.
    const writeRow = rows.find((r) => r.action === 'vault.kv.write');
    expect(writeRow).toBeDefined();
    // The path lands in the audit trail without the leading `/v1/`.
    expect(writeRow!.path).toBe('m-merch-1/data/branches/br-1/eirms');
    // Cred values are gone — replaced wholesale with the `[redacted]` marker.
    const recorded = JSON.stringify(writeRow!.requestBody);
    expect(recorded).not.toContain('CID');
    expect(recorded).not.toContain('CSECRET');
    expect(recorded).not.toContain('APIKEY');
    expect(recorded).toContain('[redacted]');
  });

  it('treats an already-enabled merchant mount as success (idempotent)', async () => {
    let mountAttempts = 0;
    const http = makeHttp((req) => {
      if (req.url.endsWith('/v1/auth/approle/login')) {
        return { status: 200, data: LOGIN_RESPONSE };
      }
      if (req.url.includes('/v1/sys/mounts/')) {
        mountAttempts += 1;
        // Vault returns 400 + this exact error string when re-enabling a
        // mount; the service should swallow it.
        return axiosError(400, {
          errors: ['path is already in use at m-merch-1/'],
        });
      }
      if (req.method === 'POST' && req.url.includes('/data/branches/')) {
        return { status: 200, data: { data: { version: 1 } } };
      }
      throw new Error(`unexpected vault call: ${req.method} ${req.url}`);
    });
    const { service: audit } = makeAudit();
    const svc = new VaultService(makeConfig(), http, audit);

    await expect(
      svc.writeBranchCreds('merch-1', 'br-1', {
        clientId: 'CID',
        clientSecret: 'CSECRET',
        apikey: 'APIKEY',
      }),
    ).resolves.toBeUndefined();
    expect(mountAttempts).toBe(1);
  });

  it('returns null for a 404 on read (never-written or soft-deleted)', async () => {
    const http = makeHttp((req) => {
      if (req.url.endsWith('/v1/auth/approle/login')) {
        return { status: 200, data: LOGIN_RESPONSE };
      }
      if (req.method === 'GET' && req.url.includes('/data/branches/')) {
        return axiosError(404, { errors: [] });
      }
      throw new Error(`unexpected vault call: ${req.method} ${req.url}`);
    });
    const { service: audit } = makeAudit();
    const svc = new VaultService(makeConfig(), http, audit);

    await expect(svc.readBranchCreds('merch-1', 'br-1')).resolves.toBeNull();
  });

  it('returns parsed creds on a successful read', async () => {
    const http = makeHttp((req) => {
      if (req.url.endsWith('/v1/auth/approle/login')) {
        return { status: 200, data: LOGIN_RESPONSE };
      }
      if (req.method === 'GET' && req.url.includes('/data/branches/')) {
        return {
          status: 200,
          data: {
            data: {
              data: { clientId: 'X', clientSecret: 'Y', apikey: 'Z' },
              metadata: { version: 1 },
            },
          },
        };
      }
      throw new Error(`unexpected vault call: ${req.method} ${req.url}`);
    });
    const { service: audit } = makeAudit();
    const svc = new VaultService(makeConfig(), http, audit);

    await expect(svc.readBranchCreds('merch-1', 'br-1')).resolves.toEqual({
      clientId: 'X',
      clientSecret: 'Y',
      apikey: 'Z',
    });
  });

  it('writes signing material at the /signing path with redacted audit', async () => {
    const seen: { url: string; body?: unknown }[] = [];
    const http = makeHttp((req) => {
      if (req.url.endsWith('/v1/auth/approle/login')) {
        return { status: 200, data: LOGIN_RESPONSE };
      }
      if (req.url.includes('/v1/sys/mounts/')) {
        return { status: 204, data: '' };
      }
      if (req.method === 'POST' && req.url.includes('/data/branches/')) {
        seen.push({ url: req.url, body: req.data });
        return { status: 200, data: { data: { version: 1 } } };
      }
      throw new Error(`unexpected vault call: ${req.method} ${req.url}`);
    });
    const { service: audit, rows } = makeAudit();
    const svc = new VaultService(makeConfig(), http, audit);

    await svc.writeBranchSigning('merch-1', 'br-1', {
      privateKeyPem: 'PRIV',
      certPem: 'CERT',
    });

    // The bytes reaching Vault carry the real material.
    const kvWrite = seen.find((s) => s.url.endsWith('/signing'));
    expect(kvWrite).toBeDefined();
    expect(JSON.stringify(kvWrite!.body)).toContain('PRIV');

    // But the audit row has them elided.
    const auditRow = rows.find((r) => r.action === 'vault.kv.write');
    expect(auditRow!.path).toBe('m-merch-1/data/branches/br-1/signing');
    const recorded = JSON.stringify(auditRow!.requestBody);
    expect(recorded).not.toContain('PRIV');
    expect(recorded).not.toContain('CERT');
    expect(recorded).toContain('[redacted]');
  });

  it('readBranchSigning returns null when the secret does not exist', async () => {
    const http = makeHttp((req) => {
      if (req.url.endsWith('/v1/auth/approle/login')) {
        return { status: 200, data: LOGIN_RESPONSE };
      }
      if (req.method === 'GET' && req.url.endsWith('/signing')) {
        return axiosError(404, { errors: [] });
      }
      throw new Error(`unexpected vault call: ${req.method} ${req.url}`);
    });
    const { service: audit } = makeAudit();
    const svc = new VaultService(makeConfig(), http, audit);

    await expect(svc.readBranchSigning('merch-1', 'br-1')).resolves.toBeNull();
  });

  it('readBranchSigning returns parsed material and preserves null cert', async () => {
    const http = makeHttp((req) => {
      if (req.url.endsWith('/v1/auth/approle/login')) {
        return { status: 200, data: LOGIN_RESPONSE };
      }
      if (req.method === 'GET' && req.url.endsWith('/signing')) {
        return {
          status: 200,
          data: {
            data: {
              data: { privateKeyPem: 'KEY', certPem: null },
              metadata: { version: 1 },
            },
          },
        };
      }
      throw new Error(`unexpected vault call: ${req.method} ${req.url}`);
    });
    const { service: audit } = makeAudit();
    const svc = new VaultService(makeConfig(), http, audit);

    await expect(svc.readBranchSigning('merch-1', 'br-1')).resolves.toEqual({
      privateKeyPem: 'KEY',
      certPem: null,
    });
  });
});
