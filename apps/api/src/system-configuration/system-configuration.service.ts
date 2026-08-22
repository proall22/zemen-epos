import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TaxCodeType, type TaxCode } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTaxCodeDto,
  UpdateSystemRuleDto,
  UpdateTaxCodeDto,
} from './dto/system-configuration.dto';

export const SYSTEM_RULE = {
  SUPPLIER_WITHHOLDING: 'WITHHOLDING_SUPPLIER',
  GOODS_THRESHOLD: 'SUPPLY_GOODS_THRESHOLD',
  SERVICES_THRESHOLD: 'SUPPLY_SERVICES_THRESHOLD',
} as const;

export interface CalculatedInvoiceLine {
  LineNumber: number;
  TaxCode: string;
  TaxRate: number;
  TaxType: TaxCodeType;
  PreTaxValue: number;
  ExciseTaxValue: number;
  TaxAmount: number;
  TotalLineAmount: number;
}

export interface WithholdingCalculation {
  preTaxAmount: number;
  nature: 'goods' | 'service';
  rate: number;
  threshold: number;
  applicable: boolean;
  withholdingAmount: number;
  netPayable: number;
}

@Injectable()
export class SystemConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listTaxCodes(includeInactive = true) {
    return this.prisma.taxCode.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ active: 'desc' }, { code: 'asc' }],
    });
  }

  async createTaxCode(input: CreateTaxCodeDto) {
    this.assertTaxSemantics(input.rate, input.type);
    const created = await this.prisma.taxCode.create({
      data: {
        ...input,
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        description: input.description?.trim() || null,
      },
    });
    await this.auditChange(
      'configuration.tax-code.create',
      created.id,
      null,
      created,
    );
    return created;
  }

  async updateTaxCode(id: string, input: UpdateTaxCodeDto) {
    const old = await this.prisma.taxCode.findUnique({ where: { id } });
    if (!old) throw new NotFoundException(`Tax code ${id} not found`);
    const nextRate = input.rate ?? old.rate;
    const nextType = input.type ?? old.type;
    this.assertTaxSemantics(nextRate, nextType);
    const updated = await this.prisma.taxCode.update({
      where: { id },
      data: input,
    });
    await this.auditChange('configuration.tax-code.update', id, old, updated);
    return updated;
  }

  listRules() {
    return this.prisma.systemRule.findMany({ orderBy: { code: 'asc' } });
  }

  async updateRule(code: string, input: UpdateSystemRuleDto) {
    const old = await this.prisma.systemRule.findUnique({ where: { code } });
    if (!old) throw new NotFoundException(`System rule ${code} not found`);
    if (
      !Object.values(SYSTEM_RULE).includes(
        code as (typeof SYSTEM_RULE)[keyof typeof SYSTEM_RULE],
      )
    ) {
      throw new NotFoundException(
        `System rule ${code} is not managed by this service`,
      );
    }
    if (input.active === false) {
      throw new ConflictException(
        'Required calculation rules cannot be deactivated.',
      );
    }
    const updated = await this.prisma.systemRule.update({
      where: { code },
      data: input,
    });
    await this.auditChange(
      'configuration.rule.update',
      updated.id,
      old,
      updated,
    );
    return updated;
  }

  async ruleValue(code: string): Promise<number> {
    const rule = await this.prisma.systemRule.findUnique({ where: { code } });
    if (!rule?.active)
      throw new BadRequestException(
        `Required system rule ${code} is inactive or missing.`,
      );
    return rule.value;
  }

  async withholding(
    preTaxAmount: number,
    nature: 'goods' | 'service',
  ): Promise<WithholdingCalculation> {
    const normalizedNature = nature.toLowerCase() as 'goods' | 'service';
    if (normalizedNature !== 'goods' && normalizedNature !== 'service') {
      throw new BadRequestException('Nature must be goods or service.');
    }
    const base = round2(preTaxAmount);
    const thresholdCode =
      normalizedNature === 'service'
        ? SYSTEM_RULE.SERVICES_THRESHOLD
        : SYSTEM_RULE.GOODS_THRESHOLD;
    const [rate, threshold] = await Promise.all([
      this.ruleValue(SYSTEM_RULE.SUPPLIER_WITHHOLDING),
      this.ruleValue(thresholdCode),
    ]);
    // Confirmed wording is strictly "greater than". Equality does not qualify.
    const applicable = base > threshold;
    const amount = applicable ? percentOf(base, rate) : 0;
    return {
      preTaxAmount: base,
      nature: normalizedNature,
      rate,
      threshold,
      applicable,
      withholdingAmount: amount,
      netPayable: round2(base - amount),
    };
  }

  async calculateLines(
    lines: Array<{
      LineNumber: number;
      Quantity: number;
      UnitPrice: number;
      Discount?: number;
      ExciseTaxValue?: number;
      TaxCode: string;
    }>,
  ) {
    const codes = [
      ...new Set(lines.map((line) => line.TaxCode.trim().toUpperCase())),
    ];
    const configs = await this.prisma.taxCode.findMany({
      where: { code: { in: codes }, active: true },
    });
    const byCode = new Map(configs.map((config) => [config.code, config]));
    const calculated: CalculatedInvoiceLine[] = lines.map((line) => {
      const code = line.TaxCode.trim().toUpperCase();
      const config = byCode.get(code);
      if (!config)
        throw new BadRequestException(
          `Tax code ${code} is inactive or not configured.`,
        );
      const preTax = round2(
        Math.max(0, line.Quantity * line.UnitPrice - (line.Discount ?? 0)),
      );
      const excise = round2(line.ExciseTaxValue ?? 0);
      // Discount is removed before VAT, and excise is tracked separately.
      // The confirmed VAT base is the pre-tax amount only.
      const vat = percentOf(preTax, config.rate);
      const taxAmount = round2(vat + excise);
      return {
        LineNumber: line.LineNumber,
        TaxCode: code,
        TaxRate: config.rate,
        TaxType: config.type,
        PreTaxValue: preTax,
        ExciseTaxValue: excise,
        TaxAmount: taxAmount,
        TotalLineAmount: round2(preTax + taxAmount),
      };
    });
    return {
      lines: calculated,
      preTaxValue: round2(
        calculated.reduce((sum, line) => sum + line.PreTaxValue, 0),
      ),
      taxValue: round2(
        calculated.reduce((sum, line) => sum + line.TaxAmount, 0),
      ),
      exciseValue: round2(
        calculated.reduce((sum, line) => sum + line.ExciseTaxValue, 0),
      ),
      totalValue: round2(
        calculated.reduce((sum, line) => sum + line.TotalLineAmount, 0),
      ),
    };
  }

  async activeTaxCode(code: string): Promise<TaxCode> {
    const normalized = code.trim().toUpperCase();
    const configured = await this.prisma.taxCode.findUnique({
      where: { code: normalized },
    });
    if (!configured?.active) {
      throw new BadRequestException(
        `Tax code ${normalized || '(empty)'} is inactive or not configured.`,
      );
    }
    return configured;
  }

  private assertTaxSemantics(rate: number, type: TaxCodeType): void {
    if (
      (type === TaxCodeType.ZERO_RATED || type === TaxCodeType.EXEMPT) &&
      rate !== 0
    ) {
      throw new BadRequestException(
        'Zero-rated and exempt tax codes must have a 0% rate.',
      );
    }
  }

  private auditChange(
    action: string,
    id: string,
    oldValue: unknown,
    newValue: unknown,
  ) {
    return this.audit.recordInbound({
      action,
      method: 'PATCH',
      path: '/system-configuration',
      entityType: 'system-configuration',
      entityId: id,
      summary: 'System configuration changed',
      requestBody: { oldValue },
      responseBody: { newValue },
      statusCode: 200,
      success: true,
    });
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
function percentOf(base: number, rate: number): number {
  return round2((base * rate) / 100);
}
