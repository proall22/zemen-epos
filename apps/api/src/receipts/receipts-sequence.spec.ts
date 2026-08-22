import type { RequestContextService } from '../audit/request-context.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ReceiptsService } from './receipts.service';

/**
 * The receipt counter is a MoR sequence, and it leaked twice:
 *   - no merchantScope, so with no branch context it aggregated every
 *     merchant's receipts in the table and returned someone else's counter;
 *   - getNextSequence() took no argument, so a merchant admin settling
 *     another branch's invoice stamped this branch's counter onto that
 *     branch's stream.
 */

interface AggArgs {
  where?: { merchantId?: string; branchId?: string; kind?: unknown };
}

function makeService(ctxBranchId: string | null) {
  const seen: AggArgs[] = [];
  const prisma = {
    receipt: {
      aggregate: (args: AggArgs) => {
        seen.push(args);
        return Promise.resolve({ _max: { receiptCounter: 0 } });
      },
    },
  } as unknown as PrismaService;
  const context = {
    get: () => ({ requestId: 'r', merchantId: 'm-A', branchId: ctxBranchId }),
  } as unknown as RequestContextService;
  const svc = new ReceiptsService(
    {} as never,
    {} as never,
    {} as never,
    prisma,
    {} as never,
    {} as never,
    context,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { svc, seen };
}

describe('ReceiptsService sequence scoping', () => {
  it('always filters by merchant, even with no branch context', async () => {
    const { svc, seen } = makeService(null);
    await svc.getNextSequence();
    expect(seen[0]?.where?.merchantId).toBe('m-A');
  });

  it('uses the branch the receipt will be written to, not the acting branch', async () => {
    const { svc, seen } = makeService('b-acting');
    await svc.getNextSequence('b-invoice');
    expect(seen[0]?.where?.branchId).toBe('b-invoice');
    expect(seen[0]?.where?.merchantId).toBe('m-A');
  });

  it('falls back to the acting branch when none is named', async () => {
    const { svc, seen } = makeService('b-acting');
    await svc.getNextSequence();
    expect(seen[0]?.where?.branchId).toBe('b-acting');
  });

  it('scopes the withholding sequence by merchant too', async () => {
    const { svc, seen } = makeService('b-acting');
    await svc.getNextWithholdSequence();
    expect(seen[0]?.where?.merchantId).toBe('m-A');
    expect(seen[0]?.where?.branchId).toBe('b-acting');
  });
});
