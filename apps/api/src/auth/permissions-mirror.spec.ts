import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CONSENT_SCOPE_PERMISSIONS,
  hasPermission,
  PLATFORM_PERMISSIONS,
  ROLE_PERMISSIONS,
} from './permissions';

/**
 * The SPA ships its own copy of the permission map to gate UI controls. The
 * two files are hand-synced, so they drift the moment someone adds a code on
 * one side only — and the failure is quiet: a button the user can see and
 * click that 403s, or one they can't see but are entitled to.
 *
 * This parses the mirror as text rather than importing it (different package,
 * different tsconfig) and asserts the two agree exactly.
 */

const MIRROR_PATH = join(__dirname, '../../../web/src/lib/permissions.ts');

const source = readFileSync(MIRROR_PATH, 'utf8');

/**
 * Pull `NAME: [ "a.b", "c.d" ]` out of the mirror's ROLE_PERMISSIONS block.
 * A role may instead alias a named array (`SUPER_ADMIN: PLATFORM_PERMISSIONS`);
 * both sides do that, so resolve the reference rather than calling it drift.
 */
function mirrorRole(role: string): string[] {
  const alias = new RegExp(`\\b${role}:\\s*([A-Z_]+),`, 'm').exec(source);
  if (alias) return mirrorArray(alias[1]);
  const block = new RegExp(`\\b${role}:\\s*\\[([^\\]]*)\\]`, 'm').exec(source);
  if (!block) throw new Error(`Role ${role} not found in the web mirror`);
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** Pull a top-level `export const NAME: ... = [ ... ]` string array. */
function mirrorArray(name: string): string[] {
  const block = new RegExp(
    `export const ${name}[^=]*=\\s*\\[([^\\]]*)\\]`,
    'm',
  ).exec(source);
  if (!block) throw new Error(`${name} not found in the web mirror`);
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const sorted = (xs: readonly string[]) => [...xs].sort();

describe('web permission mirror', () => {
  it.each(Object.keys(ROLE_PERMISSIONS))(
    '%s grants the same codes on both sides',
    (role) => {
      expect(sorted(mirrorRole(role))).toEqual(
        sorted(ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS]),
      );
    },
  );

  it('PLATFORM_PERMISSIONS match', () => {
    expect(sorted(mirrorArray('PLATFORM_PERMISSIONS'))).toEqual(
      sorted(PLATFORM_PERMISSIONS),
    );
  });

  it('every consent scope unlocks the same codes', () => {
    for (const [scope, codes] of Object.entries(CONSENT_SCOPE_PERMISSIONS)) {
      const block = new RegExp(`${scope}:\\s*\\[([^\\]]*)\\]`, 'm').exec(
        source,
      );
      expect(block).not.toBeNull();
      const mirrored = [...block![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      expect(sorted(mirrored)).toEqual(sorted(codes));
    }
  });
});

describe('report permissions', () => {
  it('are held by the two roles that configure reports', () => {
    for (const role of ['MERCHANT_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT'] as const) {
      expect(ROLE_PERMISSIONS[role]).toContain('report.view');
      expect(ROLE_PERMISSIONS[role]).toContain('report.manage');
    }
  });

  it('are held by nobody else', () => {
    for (const role of ['STORE_KEEPER', 'CASHIER', 'SUPPORT'] as const) {
      expect(ROLE_PERMISSIONS[role]).not.toContain('report.view');
      expect(ROLE_PERMISSIONS[role]).not.toContain('report.manage');
    }
  });

  it('are not platform permissions — a SUPER_ADMIN needs consent', () => {
    expect(PLATFORM_PERMISSIONS).not.toContain('report.view');
    expect(PLATFORM_PERMISSIONS).not.toContain('report.manage');
  });
});

describe('SUPER_ADMIN wildcard', () => {
  it('grants every permission code without a consent scope', () => {
    for (const code of [
      'user.create',
      'invoice.create',
      'receipt.create',
      'inventory.update',
      'report.manage',
      'future.permission',
    ]) {
      expect(hasPermission('SUPER_ADMIN', code)).toBe(true);
    }
  });
});
