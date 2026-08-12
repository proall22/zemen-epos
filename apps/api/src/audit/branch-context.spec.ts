import { AsyncLocalStorage } from 'node:async_hooks';

import {
  RequestContextService,
  type RequestContext,
} from './request-context.service';
import { listScope, tenantScope } from '../common/tenant-scope';

/**
 * Branch isolation regressions. These exist because the interceptor-resolved
 * branch was silently discarded for months: BranchContextInterceptor runs
 * first and calls setBranch, then AuditInterceptor called setActor, which
 * overwrote branchId with the JWT's value — null for merchant-wide roles. The
 * effect was that a MERCHANT_ADMIN saw every branch's data on every screen no
 * matter which branch they had selected, and nothing failed loudly.
 */

/** Real service instance with a live ALS store, so ordering is exercised for
 *  real rather than mocked away. */
function withContext(
  seed: RequestContext,
  fn: (svc: RequestContextService) => void,
): void {
  const svc = new RequestContextService();
  // `run` takes a sync fn; drive it directly against the private ALS the same
  // way the HTTP middleware does.
  (svc as unknown as { als: AsyncLocalStorage<RequestContext> }).als.run(
    seed,
    () => fn(svc),
  );
}

const ACTOR = {
  sub: 'u-1',
  email: 'admin@example.com',
  role: 'MERCHANT_ADMIN',
  merchantId: 'm-A',
  branchId: null as string | null,
};

describe('branch context resolution', () => {
  it('keeps the selected branch when setActor runs after setBranch', () => {
    withContext({ requestId: 'r' }, (svc) => {
      // Interceptor order: branch first, actor second.
      svc.setBranch('b-selected');
      svc.setActor(ACTOR);
      expect(svc.get()?.branchId).toBe('b-selected');
    });
  });

  it('falls back to the JWT branch when no header was sent', () => {
    withContext({ requestId: 'r' }, (svc) => {
      svc.setActor({ ...ACTOR, branchId: 'b-pinned' });
      expect(svc.get()?.branchId).toBe('b-pinned');
    });
  });

  it('leaves branch null for a merchant-wide role with no header', () => {
    withContext({ requestId: 'r' }, (svc) => {
      svc.setActor(ACTOR);
      expect(svc.get()?.branchId).toBeNull();
    });
  });

  it('scopes list queries to the selected branch, not the JWT', () => {
    withContext({ requestId: 'r' }, (svc) => {
      svc.setBranch('b-selected');
      svc.setActor(ACTOR);
      expect(tenantScope(svc.get())).toEqual({
        merchantId: 'm-A',
        branchId: 'b-selected',
      });
    });
  });

  it('drops the branch filter only for a merchant admin asking for all branches', () => {
    withContext({ requestId: 'r' }, (svc) => {
      svc.setBranch('b-selected');
      svc.setActor(ACTOR);
      expect(listScope(svc.get(), { crossBranch: true })).toEqual({
        merchantId: 'm-A',
      });
    });
  });

  it('ignores crossBranch for a cashier', () => {
    withContext({ requestId: 'r' }, (svc) => {
      svc.setBranch('b-selected');
      svc.setActor({ ...ACTOR, role: 'CASHIER' });
      expect(listScope(svc.get(), { crossBranch: true })).toEqual({
        merchantId: 'm-A',
        branchId: 'b-selected',
      });
    });
  });

  it('never returns an unscoped filter for a merchant-scoped actor', () => {
    withContext({ requestId: 'r' }, (svc) => {
      svc.setActor(ACTOR);
      // No branch anywhere — but the merchant filter must still be present,
      // or a query reads across tenants.
      expect(tenantScope(svc.get()).merchantId).toBe('m-A');
    });
  });
});
