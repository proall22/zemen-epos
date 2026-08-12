import { Injectable, NotFoundException } from '@nestjs/common';
import type { Buyer, Prisma } from '@prisma/client';

import { RequestContextService } from '../audit/request-context.service';
import { merchantScope } from '../common/tenant-scope';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBuyerDto } from './dto/create-buyer.dto';

export const WALKIN_TIN = 'WALKIN';

function walkInTemplate(): CreateBuyerDto {
  return { tin: WALKIN_TIN, legalName: 'Walk In Customer' } as CreateBuyerDto;
}

@Injectable()
export class BuyersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  list(): Promise<Buyer[]> {
    return this.prisma.buyer.findMany({
      where: { ...merchantScope(this.context.get()) },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(id: string): Promise<Buyer> {
    const buyer = await this.prisma.buyer.findFirst({
      where: { id, ...merchantScope(this.context.get()) },
    });
    if (!buyer) throw new NotFoundException(`Buyer ${id} not found`);
    return buyer;
  }

  create(input: CreateBuyerDto): Promise<Buyer> {
    const merchantId = this.resolveMerchantId();
    return this.prisma.buyer.create({
      data: this.toCreate(input, merchantId),
    });
  }

  /**
   * Upsert a buyer keyed by `(merchantId, tin)` — TIN is no longer globally
   * unique post-multi-tenancy, so each merchant gets its own buyer book.
   * Falls through to {@link create} when the caller is cross-tenant
   * (SUPER_ADMIN bootstrap) and the buyer doesn't yet exist.
   */
  async upsertByTin(input: CreateBuyerDto): Promise<Buyer> {
    const merchantId = this.resolveMerchantId();
    const existing = await this.prisma.buyer.findUnique({
      where: { merchantId_tin: { merchantId, tin: input.tin } },
    });
    // Shared per-merchant sentinel — create once, never update (would leak
    // per-invoice customer data across unrelated walk-in sales).
    if (input.tin === WALKIN_TIN) {
      return existing ?? this.prisma.buyer.create({
        data: this.toCreate(walkInTemplate(), merchantId),
      });
    }
    const data = this.toUpdate(input);
    if (existing) {
      return this.prisma.buyer.update({ where: { id: existing.id }, data });
    }
    return this.prisma.buyer.create({ data: this.toCreate(input, merchantId) });
  }

  /** Resolve the merchant to write to from the request context. Falls back to
   *  the default merchant only when there's no context at all (system call). */
  private resolveMerchantId(): string {
    const ctx = this.context.get();
    if (ctx?.merchantId) return ctx.merchantId;
    // SUPER_ADMIN writing a buyer is a Phase D concern; until then refuse so
    // we don't leak rows into a wrong-tenant book.
    throw new NotFoundException(
      'A merchant context is required to write buyer records.',
    );
  }

  private toCreate(
    input: CreateBuyerDto,
    merchantId: string,
  ): Prisma.BuyerCreateInput {
    return {
      tin: input.tin,
      legalName: input.legalName,
      email: input.email,
      phone: input.phone,
      vatNumber: input.vatNumber,
      idType: input.idType,
      idNumber: input.idNumber,
      houseNumber: input.houseNumber,
      region: input.region,
      country: input.country,
      zone: input.zone,
      kebele: input.kebele,
      wereda: input.wereda,
      city: input.city,
      merchant: { connect: { id: merchantId } },
    };
  }

  private toUpdate(input: CreateBuyerDto): Prisma.BuyerUpdateInput {
    return {
      legalName: input.legalName,
      email: input.email,
      phone: input.phone,
      vatNumber: input.vatNumber,
      idType: input.idType,
      idNumber: input.idNumber,
      houseNumber: input.houseNumber,
      region: input.region,
      country: input.country,
      zone: input.zone,
      kebele: input.kebele,
      wereda: input.wereda,
      city: input.city,
    };
  }
}
