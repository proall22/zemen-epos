import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type HarmonizationCode } from '@prisma/client';

import { RequestContextService } from '../audit/request-context.service';
import { merchantScope } from '../common/tenant-scope';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHarmonizationCodeDto } from './dto/create-harmonization-code.dto';
import { UpdateHarmonizationCodeDto } from './dto/update-harmonization-code.dto';

@Injectable()
export class HarmonizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  private resolveMerchantId(): string {
    const ctx = this.context.get();
    if (ctx?.merchantId) return ctx.merchantId;
    throw new NotFoundException(
      'A merchant context is required to manage harmonization codes.',
    );
  }

  list(includeInactive = false): Promise<HarmonizationCode[]> {
    return this.prisma.harmonizationCode.findMany({
      where: {
        ...merchantScope(this.context.get()),
        ...(includeInactive ? {} : { active: true }),
      },
      orderBy: { code: 'asc' },
    });
  }

  async get(id: string): Promise<HarmonizationCode> {
    const found = await this.prisma.harmonizationCode.findFirst({
      where: { id, ...merchantScope(this.context.get()) },
    });
    if (!found) throw new NotFoundException(`Harmonization code ${id} not found`);
    return found;
  }

  private rethrowAsConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'That harmonization code is already registered for this merchant.',
      );
    }
    throw error;
  }

  async create(
    input: CreateHarmonizationCodeDto,
  ): Promise<HarmonizationCode> {
    const merchantId = this.resolveMerchantId();
    try {
      return await this.prisma.harmonizationCode.create({
        data: {
          merchantId,
          code: input.code.trim(),
          description: input.description?.trim() || null,
          exciseRate: input.exciseRate ?? 0,
          active: input.active ?? true,
        },
      });
    } catch (error) {
      this.rethrowAsConflict(error);
    }
  }

  async update(
    id: string,
    input: UpdateHarmonizationCodeDto,
  ): Promise<HarmonizationCode> {
    await this.get(id);
    const data: Prisma.HarmonizationCodeUpdateInput = {};
    if (input.code !== undefined) data.code = input.code.trim();
    if (input.description !== undefined)
      data.description = input.description.trim() || null;
    if (input.exciseRate !== undefined) data.exciseRate = input.exciseRate;
    if (input.active !== undefined) data.active = input.active;
    try {
      return await this.prisma.harmonizationCode.update({
        where: { id },
        data,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Harmonization code ${id} not found`);
      }
      this.rethrowAsConflict(error);
    }
  }

  /** Soft delete. Items that already copied this code keep working — they hold
   *  their own code + rate, so nothing historical is rewritten. */
  async remove(id: string): Promise<HarmonizationCode> {
    await this.get(id);
    return this.prisma.harmonizationCode.update({
      where: { id },
      data: { active: false },
    });
  }
}
