import { TransactionalEmailService } from './transactional-email.service';

function service() {
  return new TransactionalEmailService({
    mail: {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      user: '',
      password: '',
      from: '',
    },
  } as never);
}

describe('TransactionalEmailService', () => {
  it('does not roll back a completed business action when delivery is unavailable', async () => {
    await expect(
      service().notify({
        type: 'ACCOUNT_CREATED',
        to: 'user@example.com',
        name: 'User',
        accountType: 'Cashier',
      }),
    ).resolves.toBeUndefined();
  });

  it('renders a professional login alert without authentication secrets', () => {
    const rendered = (
      service() as unknown as {
        render(event: object): { subject: string; html: string; text: string };
      }
    ).render({
      type: 'LOGIN_SUCCEEDED',
      to: 'user@example.com',
      name: '<Admin>',
      occurredAt: new Date('2026-08-18T20:45:00Z'),
      ip: '192.0.2.5',
      userAgent: 'Browser\nInjected',
    });

    expect(rendered.subject).toBe('New sign-in to your Zemen ePOS account');
    expect(rendered.html).toContain('&lt;Admin&gt;');
    expect(rendered.html).toContain('192.0.2.5');
    expect(rendered.html).not.toMatch(
      /access token|refresh token|OTP code|app password/i,
    );
    expect(rendered.text).toContain('two-step verification');
  });

  it('lists only the changed fields supplied by the application event', () => {
    const rendered = (
      service() as unknown as {
        render(event: object): { html: string };
      }
    ).render({
      type: 'ACCOUNT_UPDATED',
      to: 'user@example.com',
      name: 'User',
      changedFields: ['Business name', 'Phone number'],
    });
    expect(rendered.html).toContain('Business name');
    expect(rendered.html).toContain('Phone number');
    expect(rendered.html).not.toContain('VAT number');
  });
});
