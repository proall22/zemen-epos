import { BadRequestException } from '@nestjs/common';
import { TaxCodeType } from '@prisma/client';

import { SystemConfigurationService } from './system-configuration.service';

describe('SystemConfigurationService calculations', () => {
  const taxRows = [
    { code: 'VAT15', rate: 15, type: TaxCodeType.STANDARD, active: true },
    { code: 'VAT10', rate: 10, type: TaxCodeType.STANDARD, active: true },
    { code: 'VAT0', rate: 0, type: TaxCodeType.ZERO_RATED, active: true },
    { code: 'VATEX', rate: 0, type: TaxCodeType.EXEMPT, active: true },
  ];
  const ruleValues: Record<string, number> = {
    WITHHOLDING_SUPPLIER: 3,
    SUPPLY_GOODS_THRESHOLD: 20_000,
    SUPPLY_SERVICES_THRESHOLD: 10_000,
  };
  const prisma = {
    taxCode: {
      findMany: jest.fn(({ where }: { where: { code: { in: string[] } } }) =>
        Promise.resolve(
          taxRows.filter(
            (row) => row.active && where.code.in.includes(row.code),
          ),
        ),
      ),
      findUnique: jest.fn(({ where }: { where: { code: string } }) =>
        Promise.resolve(taxRows.find((row) => row.code === where.code) ?? null),
      ),
    },
    systemRule: {
      findUnique: jest.fn(({ where }: { where: { code: string } }) =>
        Promise.resolve({
          code: where.code,
          value: ruleValues[where.code],
          active: true,
        }),
      ),
    },
  };
  const service = new SystemConfigurationService(
    prisma as never,
    { recordInbound: jest.fn() } as never,
  );

  beforeEach(() => {
    ruleValues.WITHHOLDING_SUPPLIER = 3;
    ruleValues.SUPPLY_GOODS_THRESHOLD = 20_000;
    ruleValues.SUPPLY_SERVICES_THRESHOLD = 10_000;
    taxRows[0].rate = 15;
  });

  it.each([
    ['VAT15', 285, 2_185, TaxCodeType.STANDARD],
    ['VAT10', 190, 2_090, TaxCodeType.STANDARD],
    ['VAT0', 0, 1_900, TaxCodeType.ZERO_RATED],
    ['VATEX', 0, 1_900, TaxCodeType.EXEMPT],
  ])(
    'calculates %s after quantity and discount',
    async (code, tax, total, type) => {
      const result = await service.calculateLines([
        {
          LineNumber: 1,
          Quantity: 2,
          UnitPrice: 1_000,
          Discount: 100,
          ExciseTaxValue: 0,
          TaxCode: code,
        },
      ]);
      expect(result.lines[0]).toMatchObject({
        PreTaxValue: 1_900,
        TaxAmount: tax,
        TotalLineAmount: total,
        TaxType: type,
      });
    },
  );

  it('handles zero discount, prevents negative pre-tax, and rounds lines to cents', async () => {
    const result = await service.calculateLines([
      {
        LineNumber: 1,
        Quantity: 3,
        UnitPrice: 0.1,
        Discount: 0.01,
        TaxCode: 'VAT15',
      },
      {
        LineNumber: 2,
        Quantity: 1,
        UnitPrice: 5,
        Discount: 10,
        TaxCode: 'VAT15',
      },
    ]);
    expect(result.lines[0]).toMatchObject({
      PreTaxValue: 0.29,
      TaxAmount: 0.04,
      TotalLineAmount: 0.33,
    });
    expect(result.lines[1]).toMatchObject({
      PreTaxValue: 0,
      TaxAmount: 0,
      TotalLineAmount: 0,
    });
  });

  it('rejects an unknown or inactive tax code', async () => {
    await expect(
      service.calculateLines([
        { LineNumber: 1, Quantity: 1, UnitPrice: 1, TaxCode: 'BAD' },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['goods', 19_999.99, false],
    ['goods', 20_000, false],
    ['goods', 20_000.01, true],
    ['service', 9_999.99, false],
    ['service', 10_000, false],
    ['service', 10_000.01, true],
  ] as const)(
    '%s at %s has applicable=%s',
    async (nature, amount, applicable) => {
      const result = await service.withholding(amount, nature);
      expect(result.applicable).toBe(applicable);
      expect(result.withholdingAmount).toBe(
        applicable ? Math.round(amount * 0.03 * 100) / 100 : 0,
      );
    },
  );

  it('uses pre-tax rather than VAT-inclusive value as the withholding base', async () => {
    const result = await service.withholding(20_000.01, 'goods');
    expect(result.withholdingAmount).toBe(600);
    expect(result.withholdingAmount).not.toBe(690);
  });

  it('uses changed configuration only for new calculations', async () => {
    const issuedTax = await service.calculateLines([
      { LineNumber: 1, Quantity: 1, UnitPrice: 100, TaxCode: 'VAT15' },
    ]);
    const issuedWithholding = await service.withholding(20_000.01, 'goods');
    taxRows[0].rate = 16;
    ruleValues.WITHHOLDING_SUPPLIER = 4;
    ruleValues.SUPPLY_GOODS_THRESHOLD = 25_000;
    const nextTax = await service.calculateLines([
      { LineNumber: 1, Quantity: 1, UnitPrice: 100, TaxCode: 'VAT15' },
    ]);
    const nextWithholding = await service.withholding(20_000.01, 'goods');
    expect(issuedTax.lines[0]).toMatchObject({ TaxRate: 15, TaxAmount: 15 });
    expect(issuedWithholding).toMatchObject({
      rate: 3,
      threshold: 20_000,
      withholdingAmount: 600,
    });
    expect(nextTax.lines[0]).toMatchObject({ TaxRate: 16, TaxAmount: 16 });
    expect(nextWithholding).toMatchObject({
      rate: 4,
      threshold: 25_000,
      applicable: false,
    });
    expect(issuedTax.lines[0].TaxRate).toBe(15);
    expect(issuedWithholding.rate).toBe(3);
  });
});
