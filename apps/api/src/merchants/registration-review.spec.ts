import { ForbiddenException } from '@nestjs/common';

import { MerchantsService } from './merchants.service';

function service(role: string, rows: unknown[] = []) {
  const prisma = {
    merchantLegalDocument: {
      findMany: jest.fn().mockResolvedValue(rows),
      findFirst: jest.fn(),
    },
  };
  const context = {
    get: jest.fn().mockReturnValue({
      actorId: 'reviewer-1',
      actorRole: role,
      merchantId: role === 'SUPER_ADMIN' ? null : 'm1',
    }),
  };
  return {
    prisma,
    instance: new MerchantsService(
      prisma as never,
      { get: jest.fn() } as never,
      context as never,
      {} as never,
      { notify: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ),
  };
}

describe('legal registration review authorization', () => {
  it('refuses the global review queue to a merchant administrator', async () => {
    const { instance } = service('MERCHANT_ADMIN');
    await expect(instance.listRegistrationReviews()).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('returns email verification and document review state from the database', async () => {
    const verifiedAt = new Date('2026-08-18T12:00:00Z');
    const createdAt = new Date('2026-08-18T11:00:00Z');
    const { instance, prisma } = service('SUPER_ADMIN', [
      {
        id: 'd1',
        merchantId: 'm1',
        originalName: 'license.pdf',
        mediaType: 'application/pdf',
        sizeBytes: 1024,
        status: 'PENDING',
        createdAt,
        reviewedBy: null,
        reviewedAt: null,
        rejectionReason: null,
        reviewer: null,
        merchant: {
          legalName: 'Example Merchant',
          tin: '1234567890',
          phone: null,
          createdAt,
        },
        user: {
          id: 'u1',
          name: 'Owner',
          email: 'owner@example.com',
          emailVerifiedAt: verifiedAt,
          phone: null,
          phoneVerifiedAt: null,
        },
      },
    ]);

    const result = await instance.listRegistrationReviews('PENDING');
    expect(prisma.merchantLegalDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PENDING' } }),
    );
    expect(result[0]).toEqual(
      expect.objectContaining({
        merchantId: 'm1',
        applicant: expect.objectContaining({
          email: 'owner@example.com',
          emailVerifiedAt: verifiedAt.toISOString(),
        }),
        document: expect.objectContaining({ status: 'PENDING' }),
      }),
    );
  });
});
