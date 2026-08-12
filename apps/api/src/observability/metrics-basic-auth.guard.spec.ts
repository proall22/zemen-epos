import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';

import { MetricsBasicAuthGuard } from './metrics-basic-auth.guard';

function makeCtx(authHeader?: string): {
  ctx: ExecutionContext;
  res: { setHeader: jest.Mock };
} {
  const res = { setHeader: jest.fn() };
  const req = {
    headers: authHeader ? { authorization: authHeader } : {},
  };
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
  return { ctx, res };
}

const cfg = {
  user: 'metrics',
  password: 'metrics',
};

describe('MetricsBasicAuthGuard', () => {
  it('admits a correct user/password and sets no challenge header', () => {
    const guard = new MetricsBasicAuthGuard(cfg);
    const token = Buffer.from('metrics:metrics').toString('base64');
    const { ctx, res } = makeCtx(`Basic ${token}`);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('rejects a missing Authorization header with a basic-auth challenge', () => {
    const guard = new MetricsBasicAuthGuard(cfg);
    const { ctx, res } = makeCtx();
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    expect(res.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Basic realm="metrics"',
    );
  });

  it('rejects a wrong password without leaking which field was wrong', () => {
    const guard = new MetricsBasicAuthGuard(cfg);
    const token = Buffer.from('metrics:nope').toString('base64');
    const { ctx } = makeCtx(`Basic ${token}`);
    expect(() => guard.canActivate(ctx)).toThrow(/Invalid credentials/);
  });

  it('rejects when the decoded credentials have no colon separator', () => {
    const guard = new MetricsBasicAuthGuard(cfg);
    const token = Buffer.from('no-colon-here').toString('base64');
    const { ctx } = makeCtx(`Basic ${token}`);
    expect(() => guard.canActivate(ctx)).toThrow(/Malformed credentials/);
  });
});
