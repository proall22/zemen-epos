import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import nodemailer from 'nodemailer';

import { authVerificationConfig } from '../auth/auth-verification.config';

export type TransactionalEmailEvent =
  | {
      type: 'LOGIN_SUCCEEDED';
      to: string;
      name: string | null;
      occurredAt: Date;
      ip?: string | null;
      userAgent?: string | null;
    }
  | {
      type: 'LOGIN_FAILURE_THRESHOLD';
      to: string;
      name: string | null;
      occurredAt: Date;
      attempts: number;
      ip?: string | null;
    }
  | {
      type: 'ACCOUNT_CREATED';
      to: string;
      name: string | null;
      accountType: string;
    }
  | {
      type: 'ACCOUNT_UPDATED';
      to: string;
      name: string | null;
      changedFields: string[];
    }
  | {
      type: 'MERCHANT_CREATED';
      to: string;
      merchantName: string;
    }
  | {
      type: 'REGISTRATION_SUBMITTED';
      to: string;
      applicantName: string;
      applicantEmail: string;
      merchantName: string;
      occurredAt: Date;
    }
  | {
      type: 'REGISTRATION_APPROVED';
      to: string;
      name: string | null;
      merchantName: string;
      occurredAt: Date;
    };

export interface DirectEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

@Injectable()
export class TransactionalEmailService {
  private readonly logger = new Logger(TransactionalEmailService.name);

  constructor(
    @Inject(authVerificationConfig.KEY)
    private readonly config: ConfigType<typeof authVerificationConfig>,
  ) {}

  /** Security-critical callers (OTP/reset) need delivery errors surfaced. */
  async sendRequired(message: DirectEmail): Promise<void> {
    const { mail } = this.config;
    if (!mail.user || !mail.password || !mail.from) {
      throw new Error('Email delivery is not configured.');
    }
    const transporter = nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.secure,
      auth: { user: mail.user, pass: mail.password },
    });
    await transporter.sendMail({
      from: { name: 'Zemen ePOS', address: mail.from },
      envelope: { from: mail.user, to: message.to },
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }

  /** Business actions stay committed if SMTP is temporarily unavailable. */
  async notify(event: TransactionalEmailEvent): Promise<void> {
    try {
      await this.sendRequired(this.render(event));
    } catch (error) {
      this.logger.error(
        `Transactional email ${event.type} could not be delivered: ${(error as Error).message}`,
      );
    }
  }

  private render(event: TransactionalEmailEvent): DirectEmail {
    const recipientName =
      event.type === 'REGISTRATION_SUBMITTED'
        ? 'Administrator'
        : 'name' in event
          ? event.name?.trim() || 'there'
          : 'there';
    const greeting = `Hello ${recipientName},`;
    switch (event.type) {
      case 'LOGIN_SUCCEEDED': {
        const rows = [
          ['Time', formatDate(event.occurredAt)],
          ['Authentication', 'Email and password with two-step verification'],
          ...(event.ip ? [['IP address', event.ip]] : []),
          ...(event.userAgent
            ? [['Browser information', cleanContext(event.userAgent)]]
            : []),
        ];
        return message(
          event.to,
          'New sign-in to your Zemen ePOS account',
          greeting,
          'Your Zemen ePOS account was successfully signed in.',
          rows,
          'If you did not make this sign-in, change your password and contact your administrator immediately.',
        );
      }
      case 'LOGIN_FAILURE_THRESHOLD':
        return message(
          event.to,
          'Security alert for your Zemen ePOS account',
          greeting,
          `We blocked repeated unsuccessful sign-in attempts to your account.`,
          [
            ['Time', formatDate(event.occurredAt)],
            ['Attempts', String(event.attempts)],
            ...(event.ip ? [['IP address', event.ip]] : []),
          ],
          'If these attempts were not yours, change your password or contact your administrator.',
        );
      case 'ACCOUNT_CREATED':
        return message(
          event.to,
          'Your Zemen ePOS account has been created',
          greeting,
          'An administrator created a Zemen ePOS account for you.',
          [
            ['Account type', event.accountType],
            ['Email', event.to],
          ],
          'Sign in with the credentials provided through your approved secure channel. Your password is never sent by email.',
        );
      case 'ACCOUNT_UPDATED':
        return message(
          event.to,
          'Your Zemen ePOS account was updated',
          greeting,
          'Your Zemen ePOS account information was updated by an administrator.',
          event.changedFields.map((field) => ['Updated', field]),
          'If you did not expect this change, contact your administrator.',
        );
      case 'MERCHANT_CREATED':
        return message(
          event.to,
          'Your Zemen ePOS merchant profile has been created',
          'Hello,',
          'An administrator created a merchant profile for your business.',
          [
            ['Business', event.merchantName],
            ['Contact email', event.to],
          ],
          'Contact your administrator for user access and the next setup steps. No password is included in this email.',
        );
      case 'REGISTRATION_SUBMITTED':
        return message(
          event.to,
          'New registration requires review',
          greeting,
          'A new business registration and legal document are ready for review.',
          [
            ['Business', event.merchantName],
            ['Applicant', event.applicantName],
            ['Applicant email', event.applicantEmail],
            ['Submitted', formatDate(event.occurredAt)],
          ],
          'Open Registration reviews in Zemen ePOS. The legal document is available only through authenticated access and is not attached to this email.',
        );
      case 'REGISTRATION_APPROVED':
        return message(
          event.to,
          'Your Zemen ePOS registration has been approved',
          greeting,
          'Your business registration and legal document have been approved.',
          [
            ['Business', event.merchantName],
            ['Approved', formatDate(event.occurredAt)],
          ],
          'You can now sign in and continue setting up your business account.',
        );
    }
  }
}

function message(
  to: string,
  subject: string,
  greeting: string,
  intro: string,
  rows: string[][],
  notice: string,
): DirectEmail {
  const rowHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px;color:#64748b;font-size:13px;width:34%">${escapeHtml(label!)}</td><td style="padding:8px 12px;color:#111827;font-size:14px;font-weight:600">${escapeHtml(value!)}</td></tr>`,
    )
    .join('');
  const textRows = rows
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
  return {
    to,
    subject,
    text: `${greeting}\n\n${intro}\n\n${textRows}\n\n${notice}\n\nZemen ePOS`,
    html: `<!doctype html><html lang="en"><body style="margin:0;background:#eef1f5;font-family:Arial,Helvetica,sans-serif;color:#111827"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #dbe2ea;border-radius:10px;overflow:hidden"><tr><td style="padding:26px 30px;background:#111827;border-bottom:4px solid #5700ff"><div style="font-size:24px;font-weight:800;color:#fff">Zemen <span style="color:#a78bfa">ePOS</span></div><div style="margin-top:5px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#cbd5e1">Account notification</div></td></tr><tr><td style="padding:30px"><h1 style="margin:0 0 20px;font-size:23px">${escapeHtml(subject)}</h1><p style="font-size:15px;line-height:1.65">${escapeHtml(greeting)}</p><p style="font-size:15px;line-height:1.65;color:#475569">${escapeHtml(intro)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">${rowHtml}</table><div style="padding:14px 16px;border-left:4px solid #5700ff;background:#f5f3ff;color:#475569;font-size:13px;line-height:1.6">${escapeHtml(notice)}</div></td></tr><tr><td style="padding:18px 30px;background:#f8fafc;border-top:1px solid #e5e7eb;color:#94a3b8;font-size:12px">Automated message from Zemen ePOS. Please do not reply.</td></tr></table></td></tr></table></body></html>`,
  };
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-ET', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Africa/Addis_Ababa',
  }).format(value);
}

function cleanContext(value: string): string {
  return value
    .replace(/[\r\n\t]/g, ' ')
    .trim()
    .slice(0, 240);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character]!;
  });
}
