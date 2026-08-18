import { of } from 'rxjs';

import type { HttpService } from '@nestjs/axios';

import type { AuditService } from '../audit/audit.service';
import type {
  RequestContext,
  RequestContextService,
} from '../audit/request-context.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { BranchEirmsCreds, VaultService } from '../vault/vault.service';
import { EirmsAuthService } from './eirms-auth.service';
import type { EirmsSigningService } from './eirms-signing.service';

// Signing off in tests — pass payloads through unchanged.
const makeSigning = () =>
  ({
    wrap: (b: unknown) => Promise.resolve(b),
    isHttps: () => false,
    invalidate: () => {},
    seedFromEnvIfMissing: () => Promise.resolve(),
  }) as unknown as EirmsSigningService;

/** A minimal JWT (header.payload.signature) — only the payload matters for
 *  the service since it parses base64url claims. */
function fakeJwt(claims: Record<string, unknown>): string {
  const enc = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${enc({ alg: 'HS256' })}.${enc(claims)}.sig`;
}

function makeHttp(handler: (path: string) => unknown) {
  const post = jest.fn((url: string) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    return of({
      status: 200,
      data: { status: 'SUCCESS', data: handler(path) },
    });
  });
  return { post } as unknown as HttpService;
}

const config = {
  baseUrl: 'https://eirms.example',
  clientId: 'env-client',
  clientSecret: 'env-secret',
  apikey: 'env-apikey',
  tin: 'env-tin',
  systemNumber: 'env-system',
  systemType: 'POS' as const,
  seller: {
    legalName: '',
    email: '',
    phone: '',
    region: '',
    wereda: '',
    vatNumber: '',
  },
};

const audit: AuditService = {
  recordOutbound: jest.fn().mockResolvedValue(undefined),
  recordInbound: jest.fn().mockResolvedValue(undefined),
} as unknown as AuditService;

function makeContext(branchId: string | null = null): RequestContextService {
  const ctx: RequestContext = { requestId: 'r', branchId };
  return { get: () => ctx } as unknown as RequestContextService;
}

function makeVault(
  byKey: Record<string, BranchEirmsCreds | null>,
): VaultService {
  return {
    readBranchCreds: jest.fn((merchantId: string, branchId: string) =>
      Promise.resolve(byKey[`${merchantId}/${branchId}`] ?? null),
    ),
  } as unknown as VaultService;
}

describe('EirmsAuthService', () => {
  it('caches tokens per branch — branch A and B trigger two logins; third call to A hits cache', async () => {
    let loginCount = 0;
    const http = makeHttp(() => {
      loginCount += 1;
      return {
        accessToken: fakeJwt({
          tin: `tin-${loginCount}`,
          systemNumber: `sys-${loginCount}`,
        }),
        refreshToken: 'r',
        expiresIn: 3600,
        encryptionKey: null,
      };
    });
    const branchById: Record<
      string,
      { id: string; merchantId: string; merchant: { tin: string } }
    > = {
      'b-A': { id: 'b-A', merchantId: 'm-A', merchant: { tin: 'A-tin' } },
      'b-B': { id: 'b-B', merchantId: 'm-B', merchant: { tin: 'B-tin' } },
    };
    const prisma = {
      branch: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(branchById[where.id] ?? null),
        ),
      },
    } as unknown as PrismaService;
    const vault = makeVault({
      'm-A/b-A': {
        clientId: 'A-id',
        clientSecret: 'A-secret',
        apikey: 'A-key',
      },
      'm-B/b-B': {
        clientId: 'B-id',
        clientSecret: 'B-secret',
        apikey: 'B-key',
      },
    });

    const svc = new EirmsAuthService(
      config,
      http,
      audit,
      prisma,
      makeContext(),
      vault,
      makeSigning(),
    );

    const tokA1 = await svc.getAccessToken('b-A');
    const tokB = await svc.getAccessToken('b-B');
    const tokA2 = await svc.getAccessToken('b-A');

    // Two distinct branches → two logins. Third call uses cache.
    expect(loginCount).toBe(2);
    expect(tokA1).toBe(tokA2);
    expect(tokA1).not.toBe(tokB);
  });

  it('refuses login when Vault has no credentials for the branch', async () => {
    const http = makeHttp(() => ({}));
    const prisma = {
      branch: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            id: 'b-x',
            merchantId: 'm-x',
            merchant: { tin: 'somet-tin' },
          }),
        ),
      },
    } as unknown as PrismaService;
    const vault = makeVault({});
    const svc = new EirmsAuthService(
      config,
      http,
      audit,
      prisma,
      makeContext(),
      vault,
      makeSigning(),
    );
    await expect(svc.getAccessToken('b-x')).rejects.toThrow(
      /no EIRMS credentials/i,
    );
  });

  it('refuses login when the branch is still on the BOOTSTRAP merchant placeholder', async () => {
    const http = makeHttp(() => ({}));
    const prisma = {
      branch: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            id: 'b-x',
            merchantId: 'm-x',
            merchant: { tin: '__BOOTSTRAP__' },
          }),
        ),
      },
    } as unknown as PrismaService;
    const vault = makeVault({
      'm-x/b-x': {
        clientId: 'A-id',
        clientSecret: 'A-secret',
        apikey: 'A-key',
      },
    });
    const svc = new EirmsAuthService(
      config,
      http,
      audit,
      prisma,
      makeContext(),
      vault,
      makeSigning(),
    );
    await expect(svc.getAccessToken('b-x')).rejects.toThrow(
      /Merchant TIN is not set/i,
    );
  });
});
