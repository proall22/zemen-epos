import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { TransactionalEmailService } from '../notifications/transactional-email.service';
import { authVerificationConfig } from './auth-verification.config';

@Injectable()
export class AuthMailService {
  constructor(
    @Inject(authVerificationConfig.KEY)
    private readonly config: ConfigType<typeof authVerificationConfig>,
    private readonly transactionalEmail: TransactionalEmailService,
  ) {}

  async sendVerificationCode(to: string, otp: string): Promise<void> {
    const minutes = Math.ceil(this.config.otpTtlSeconds / 60);
    await this.send(
      to,
      'Verify your Zemen ePOS account',
      this.template(
        'Verify your account',
        'Use this one-time code to verify your Zemen ePOS account.',
        otp,
      ),
      `Zemen ePos account verification\n\nYour OTP code is: ${otp}\n\nThis single-use code expires in ${minutes} minutes. Never share this code. If you did not request it, you can safely ignore this email.\n\nThis is an automated security message from Zemen ePos.`,
    );
  }

  async sendLoginCode(
    to: string,
    otp: string,
    context?: string,
  ): Promise<void> {
    const minutes = Math.ceil(this.config.otpTtlSeconds / 60);
    await this.send(
      to,
      'Your Zemen ePOS verification code',
      this.template(
        'Verify your sign-in',
        `Use this one-time code to finish signing in.${context ? ` Request: ${escapeHtml(context)}` : ''}`,
        otp,
      ),
      `Zemen ePos sign-in verification\n\nYour OTP code is: ${otp}\n\nThis single-use code expires in ${minutes} minutes. Never share this code. If you did not request it, you can safely ignore this email.\n\nThis is an automated security message from Zemen ePos.`,
    );
  }

  async sendPasswordReset(to: string, rawToken: string): Promise<void> {
    if (!this.config.appPublicUrl) {
      throw new ServiceUnavailableException(
        'Password-reset email is not configured.',
      );
    }
    const url = `${this.config.appPublicUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await this.send(
      to,
      'Reset your Zemen ePOS password',
      `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f1f5f9;padding:32px;color:#0f172a"><div style="max-width:560px;margin:auto;background:white;border-radius:12px;padding:28px"><h1>Reset your password</h1><p>A password reset was requested for your Zemen ePOS account.</p><p><a href="${url}" style="display:inline-block;background:#5700ff;color:white;padding:12px 20px;border-radius:8px;text-decoration:none">Reset password</a></p><p>This single-use link expires in 30 minutes. If you did not request it, ignore this message.</p><p style="font-size:12px;color:#64748b">Automated security message — please do not reply.</p></div></body></html>`,
      `Zemen ePos password reset\n\nOpen this single-use link to reset your password: ${url}\n\nThe link expires in 30 minutes. If you did not request it, ignore this message.`,
    );
  }

  private async send(
    to: string,
    subject: string,
    html: string,
    plainText: string,
  ): Promise<void> {
    try {
      await this.transactionalEmail.sendRequired({
        to,
        subject,
        text: plainText,
        html,
      });
    } catch {
      throw new ServiceUnavailableException(
        'Verification email could not be sent. Please try again later.',
      );
    }
  }

  private template(heading: string, intro: string, otp: string): string {
    const minutes = Math.ceil(this.config.otpTtlSeconds / 60);
    return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#e5e7eb;font-family:Arial,Helvetica,sans-serif;color:#111827">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e5e7eb">
      <tr><td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #dbe2ea;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08)">
          <tr><td style="padding:28px 32px;background:#111827;border-bottom:4px solid #5b21b6">
            <div style="font-size:25px;font-weight:800;letter-spacing:-.5px;color:#ffffff">Zemen <span style="color:#a78bfa">ePos</span></div>
            <div style="margin-top:6px;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#cbd5e1">Secure account verification</div>
          </td></tr>
          <tr><td style="padding:34px 32px 18px">
            <h1 style="margin:0 0 14px;font-size:25px;line-height:1.3;color:#111827">${escapeHtml(heading)}</h1>
            <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.7">${intro}</p>
            <div style="margin:28px 0 12px;padding:12px 0;text-align:center;font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#6b7280">Your OTP code</div>
            <div style="padding:22px 12px;text-align:center;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-size:34px;font-weight:800;letter-spacing:12px;color:#4c1d95">${otp}</div>
            <p style="margin:18px 0 0;text-align:center;color:#374151;font-size:14px"><strong>Expires in ${minutes} minutes.</strong> This code can only be used once.</p>
          </td></tr>
          <tr><td style="padding:18px 32px 30px">
            <div style="padding:16px 18px;background:#f9fafb;border-left:4px solid #7c3aed;color:#4b5563;font-size:13px;line-height:1.6"><strong style="color:#111827">Security notice:</strong> Never share this code. Zemen ePos will never ask for your password or OTP. If you did not request this code, you can safely ignore this email.</div>
          </td></tr>
          <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;line-height:1.6">This is an automated security message from Zemen ePos. Please do not reply.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}
