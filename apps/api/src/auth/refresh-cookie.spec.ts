import { refreshCookieOptions } from './refresh-cookie';

describe('refreshCookieOptions', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('allows the HttpOnly refresh cookie on an explicit localhost HTTP URL', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_PUBLIC_URL = 'http://localhost:4999';
    process.env.COOKIE_PATH = '/api/auth';
    delete process.env.COOKIE_SECURE;

    expect(refreshCookieOptions(true)).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/api/auth',
    });
  });

  it('defaults to Secure for an HTTPS deployment', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_PUBLIC_URL = 'https://pos.example.com';
    delete process.env.COOKIE_SECURE;

    expect(refreshCookieOptions(true).secure).toBe(true);
  });

  it('honours an explicit secure-cookie override', () => {
    process.env.APP_PUBLIC_URL = 'http://localhost:4999';
    process.env.COOKIE_SECURE = 'true';

    expect(refreshCookieOptions(true).secure).toBe(true);
  });
});
