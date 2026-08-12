import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Vendor } from '@prisma/client';

import { RequestContextService } from '../audit/request-context.service';
import { merchantScope } from '../common/tenant-scope';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  private resolveMerchantId(): string {
    const ctx = this.context.get();
    if (ctx?.merchantId) return ctx.merchantId;
    throw new NotFoundException(
      'A merchant context is required to manage vendors.',
    );
  }

  list(includeInactive = false): Promise<Vendor[]> {
    return this.prisma.vendor.findMany({
      where: {
        ...merchantScope(this.context.get()),
        ...(includeInactive ? {} : { active: true }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string): Promise<Vendor> {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, ...merchantScope(this.context.get()) },
    });
    if (!vendor) throw new NotFoundException(`Vendor ${id} not found`);
    return vendor;
  }

  private rethrowAsConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Another vendor in this merchant already uses that name.',
      );
    }
    throw error;
  }

  async create(input: CreateVendorDto): Promise<Vendor> {
    const merchantId = this.resolveMerchantId();
    try {
      return await this.prisma.vendor.create({
        data: {
          merchantId,
          name: input.name.trim(),
          contactName: input.contactName?.trim() || null,
          email: input.email?.trim().toLowerCase() || null,
          phone: input.phone?.trim() || null,
          tin: input.tin?.trim() || null,
          notes: input.notes?.trim() || null,
          active: input.active ?? true,
        },
      });
    } catch (error) {
      this.rethrowAsConflict(error);
    }
  }

  async update(id: string, input: UpdateVendorDto): Promise<Vendor> {
    await this.get(id);
    const data: Prisma.VendorUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.contactName !== undefined)
      data.contactName = input.contactName.trim() || null;
    if (input.email !== undefined)
      data.email = input.email.trim().toLowerCase() || null;
    if (input.phone !== undefined) data.phone = input.phone.trim() || null;
    if (input.tin !== undefined) data.tin = input.tin.trim() || null;
    if (input.notes !== undefined) data.notes = input.notes.trim() || null;
    if (input.active !== undefined) data.active = input.active;
    try {
      return await this.prisma.vendor.update({ where: { id }, data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Vendor ${id} not found`);
      }
      this.rethrowAsConflict(error);
    }
  }

  async remove(id: string): Promise<Vendor> {
    await this.get(id);
    return this.prisma.vendor.update({ where: { id }, data: { active: false } });
  }
}
