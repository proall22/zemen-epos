import { NotFoundException } from '@nestjs/common';

import { ReservationsService } from './reservations.service';

describe('ReservationsService tenant isolation', () => {
  const prisma = {
    stockReservation: { findFirst: jest.fn() },
    inventoryItem: { findMany: jest.fn() },
    inventoryStock: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const context = {
    get: jest.fn().mockReturnValue({
      actorId: 'user-a',
      actorEmail: 'cashier@a.example',
      merchantId: 'merchant-a',
      branchId: 'branch-a',
    }),
  };
  const storeResolver = {
    salesFloorFor: jest.fn().mockResolvedValue({ id: 'store-a' }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.stockReservation.findFirst.mockResolvedValue(null);
  });

  it('rejects a client-supplied inventory item from another merchant', async () => {
    prisma.inventoryItem.findMany.mockResolvedValue([]);
    const service = new ReservationsService(
      prisma as never,
      context as never,
      storeResolver as never,
    );

    await expect(
      service.upsert({
        cartSessionId: 'cart-a',
        items: [{ inventoryItemId: 'item-owned-by-merchant-b', quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['item-owned-by-merchant-b'] },
        merchantId: 'merchant-a',
      },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
