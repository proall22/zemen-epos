import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Branch, BranchStockPolicy, Merchant } from '@prisma/client';

import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CreateBranchDto } from './dto/create-branch.dto';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { RejectMerchantDto } from './dto/reject-merchant.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import {
  MerchantsService,
  type MerchantWithOwner,
} from './merchants.service';

/** Branch shape returned to clients — strips secret credentials. Callers see a
 *  boolean per credential indicating whether it's set, so the UI can render
 *  "configured / not configured" without exposing the secrets. */
interface SafeBranch {
  id: string;
  merchantId: string;
  name: string;
  systemNumber: string;
  city: string | null;
  region: string | null;
  zone: string | null;
  wereda: string | null;
  kebele: string | null;
  houseNumber: string | null;
  subTin: string | null;
  tradeName: string | null;
  vatNumber: string | null;
  country: string | null;
  stockPolicy: BranchStockPolicy;
  latitude: number | null;
  longitude: number | null;
  eirmsClientIdSet: boolean;
  eirmsClientSecretSet: boolean;
  eirmsApikeySet: boolean;
  /** Signing material in Vault. Readiness can't be derived from the branch
   *  row alone, so it ships alongside the cred flags. */
  hasSigningKey: boolean;
  hasCert: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toSafeBranch(
  b: Branch,
  credFlags: { clientId: boolean; clientSecret: boolean; apikey: boolean },
  signing: { hasSigningKey: boolean; hasCert: boolean } = {
    hasSigningKey: false,
    hasCert: false,
  },
): SafeBranch {
  return {
    id: b.id,
    merchantId: b.merchantId,
    name: b.name,
    systemNumber: b.systemNumber,
    city: b.city,
    region: b.region,
    zone: b.zone,
    wereda: b.wereda,
    kebele: b.kebele,
    houseNumber: b.houseNumber,
    subTin: b.subTin,
    tradeName: b.tradeName,
    vatNumber: b.vatNumber,
    country: b.country,
    stockPolicy: b.stockPolicy,
    latitude: b.latitude,
    longitude: b.longitude,
    // Cred flags come from Vault — see MerchantsService.getBranchCredFlags.
    // The DB columns are deprecated and always null after this change.
    eirmsClientIdSet: credFlags.clientId,
    eirmsClientSecretSet: credFlags.clientSecret,
    eirmsApikeySet: credFlags.apikey,
    hasSigningKey: signing.hasSigningKey,
    hasCert: signing.hasCert,
    active: b.active,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

@ApiTags('Merchants')
@Controller()
export class MerchantsController {
  constructor(private readonly merchants: MerchantsService) {}

  // ----- /merchants ---------------------------------------------------------

  @Get('merchants')
  @RequirePermissions('merchant.view')
  @ApiOperation({
    summary:
      'List merchants (scoped to caller). Each row carries its owner (earliest merchant admin) + admin count.',
  })
  list(): Promise<MerchantWithOwner[]> {
    return this.merchants.list();
  }

  @Post('merchants')
  @RequirePermissions('merchant.create')
  @ApiOperation({
    summary: 'Onboard a new merchant (super-admin only).',
    description:
      "Creates the merchant row. Add branches via POST /merchants/:id/branches; provision users with the merchant's id via POST /users.",
  })
  create(@Body() body: CreateMerchantDto): Promise<Merchant> {
    return this.merchants.create(body);
  }

  @Get('merchants/:id')
  @RequirePermissions('merchant.view')
  @ApiOperation({ summary: 'Fetch one merchant.' })
  get(@Param('id') id: string): Promise<MerchantWithOwner> {
    return this.merchants.get(id);
  }

  @Patch('merchants/:id')
  @RequirePermissions('merchant.update')
  @ApiOperation({
    summary: 'Update a merchant (partial). Send only changed fields.',
  })
  update(
    @Param('id') id: string,
    @Body() body: UpdateMerchantDto,
  ): Promise<Merchant> {
    return this.merchants.update(id, body);
  }

  @Post('merchants/:id/reject')
  // Same permission as create — both are back-office gating actions.
  @RequirePermissions('merchant.create')
  @ApiOperation({
    summary:
      'Reject a pending merchant signup. Super-admin only; sends a rejection email.',
  })
  reject(
    @Param('id') id: string,
    @Body() body: RejectMerchantDto,
  ): Promise<Merchant> {
    return this.merchants.reject(id, body);
  }

  // ----- /merchants/:id/branches -------------------------------------------

  @Get('merchants/:id/branches')
  @RequirePermissions('branch.view')
  @ApiOperation({ summary: "List a merchant's branches." })
  async listBranches(@Param('id') id: string): Promise<SafeBranch[]> {
    const branches = await this.merchants.listBranches(id);
    // Two Vault reads per branch (creds + signing), all in parallel. Branch
    // counts are small (≤ a few dozen per merchant in practice); a batched
    // read would need a different KV layout.
    const [flags, signing] = await Promise.all([
      Promise.all(branches.map((b) => this.merchants.getBranchCredFlags(id, b.id))),
      Promise.all(
        branches.map((b) => this.merchants.getBranchSigningFlags(id, b.id)),
      ),
    ]);
    return branches.map((b, i) => toSafeBranch(b, flags[i], signing[i]));
  }

  @Post('merchants/:id/branches')
  @RequirePermissions('branch.create')
  @ApiOperation({ summary: 'Add a branch under a merchant.' })
  async createBranch(
    @Param('id') id: string,
    @Body() body: CreateBranchDto,
  ): Promise<SafeBranch> {
    const branch = await this.merchants.createBranch(id, body);
    return toSafeBranch(
      branch,
      await this.merchants.getBranchCredFlags(id, branch.id),
      await this.merchants.getBranchSigningFlags(id, branch.id),
    );
  }

  @Get('merchants/:id/branches/:branchId/stats')
  @RequirePermissions('branch.view')
  @ApiOperation({
    summary: 'Per-branch activity snapshot for the merchant admin drawer.',
  })
  branchStats(
    @Param('id') id: string,
    @Param('branchId') branchId: string,
  ) {
    return this.merchants.branchStats(id, branchId);
  }

  @Patch('merchants/:id/branches/:branchId')
  @RequirePermissions('branch.update')
  @ApiOperation({
    summary:
      'Update a branch (incl. rotating EIRMS credentials). Send only changed fields.',
  })
  async updateBranch(
    @Param('id') id: string,
    @Param('branchId') branchId: string,
    @Body() body: UpdateBranchDto,
  ): Promise<SafeBranch> {
    const branch = await this.merchants.updateBranch(id, branchId, body);
    return toSafeBranch(
      branch,
      await this.merchants.getBranchCredFlags(id, branch.id),
      await this.merchants.getBranchSigningFlags(id, branch.id),
    );
  }
}
