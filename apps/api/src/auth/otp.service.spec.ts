import { BadRequestException, HttpException } from '@nestjs/common';
import bcrypt from 'bcryptjs';

import { OtpService } from './otp.service';

const config = {
  otpLength: 6,
  otpTtlSeconds: 600,
  otpMaxAttempts: 5,
  otpResendCooldownSeconds: 60,
  pendingTokenTtlSeconds: 900,
  legalDocumentMaxBytes: 5_242_880,
  legalDocumentDirectory: '/tmp/test',
  mail: {
    host: '',
    port: 587,
    secure: false,
    user: '',
    password: '',
    from: '',
  },
};

interface TestChallenge {
  id: string;
  otpHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
}

function service(challenge: TestChallenge | null) {
  const user = {
    id: 'u1',
    email: 'a@example.com',
    active: true,
    emailVerifiedAt: null,
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...user, ...data }),
        ),
    },
    authChallenge: {
      findFirst: jest.fn().mockResolvedValue(challenge),
      update: jest.fn().mockImplementation(
        ({ data }: { data: { attempts?: { increment: number } } }) =>
          Promise.resolve({
            ...challenge,
            attempts: (challenge?.attempts ?? 0) + (data.attempts ? 1 : 0),
          }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const jwt = {
    verify: jest
      .fn()
      .mockReturnValue({ sub: 'u1', purpose: 'email-verification' }),
    sign: jest.fn(),
  };
  return {
    svc: new OtpService(
      prisma as never,
      jwt as never,
      {} as never,
      {} as never,
      { get: () => ({}) } as never,
      config as never,
      { sms: { enabled: false } } as never,
    ),
    prisma,
  };
}

describe('OtpService verification', () => {
  it('accepts a valid OTP once and verifies the email', async () => {
    const otpHash = await bcrypt.hash('123456', 4);
    const { svc, prisma } = service({
      id: 'c1',
      otpHash,
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    const verified = await svc.verifyEmail('pending', '123456');
    expect(verified.emailVerifiedAt).toBeInstanceOf(Date);
    expect(prisma.authChallenge.updateMany).toHaveBeenCalledTimes(1);
  });

  it('rejects and counts an invalid OTP', async () => {
    const otpHash = await bcrypt.hash('123456', 4);
    const { svc, prisma } = service({
      id: 'c1',
      otpHash,
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    await expect(svc.verifyEmail('pending', '000000')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.authChallenge.update).toHaveBeenCalled();
  });

  it('rejects an expired OTP', async () => {
    const { svc } = service({
      id: 'c1',
      otpHash: 'hash',
      attempts: 0,
      expiresAt: new Date(Date.now() - 1),
      consumedAt: null,
    });
    await expect(svc.verifyEmail('pending', '123456')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a challenge at the attempt limit', async () => {
    const { svc } = service({
      id: 'c1',
      otpHash: 'hash',
      attempts: 5,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    await expect(svc.verifyEmail('pending', '123456')).rejects.toThrow(
      HttpException,
    );
  });

  it('rejects reuse when no live challenge remains', async () => {
    const { svc } = service(null);
    await expect(svc.verifyEmail('pending', '123456')).rejects.toThrow(
      BadRequestException,
    );
  });
});
