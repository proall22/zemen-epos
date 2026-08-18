import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  LegalDocumentStatus,
  type Branch,
  type BranchStockPolicy,
  type Merchant,
} from '@prisma/client';

import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CreateBranchDto } from './dto/create-branch.dto';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { RejectMerchantDto } from './dto/reject-merchant.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import {
  MerchantsService,
  type MerchantWithOwner,
  type PendingBranchReview,
  type RegistrationReview,
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
  approvedAt: Date | null;
  approvedBy: string | null;
  rejectedAt: Date | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
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
    approvedAt: b.approvedAt,
    approvedBy: b.approvedBy,
    rejectedAt: b.rejectedAt,
    rejectedBy: b.rejectedBy,
    rejectionReason: b.rejectionReason,
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

  @Get('platform/registrations')
  @RequirePermissions('merchant.create')
  @ApiOperation({
    summary: 'List legal registration documents for Super Admin review.',
  })
  registrationReviews(
    @Query('status') status?: LegalDocumentStatus,
  ): Promise<RegistrationReview[]> {
    return this.merchants.listRegistrationReviews(status);
  }

  @Get('platform/registrations/:merchantId/document')
  @RequirePermissions('merchant.create')
  @ApiOperation({
    summary: 'Securely open a registration document (Super Admin only).',
  })
  async registrationDocument(
    @Param('merchantId') merchantId: string,
  ): Promise<StreamableFile> {
    const file = await this.merchants.openRegistrationDocument(merchantId);
    return new StreamableFile(file.bytes, {
      type: file.mediaType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      length: file.bytes.length,
    });
  }

  @Get('merchants/:id/registration-status')
  @RequirePermissions('merchant.view')
  @ApiOperation({ summary: 'Current registration and legal-document status.' })
  registrationStatus(@Param('id') id: string): Promise<RegistrationReview> {
    return this.merchants.getRegistrationReview(id);
  }

  @Post('merchants/:id/registration-document')
  @RequirePermissions('merchant.update')
  @UseInterceptors(
    FileInterceptor('legalDocument', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiOperation({
    summary: 'Replace a rejected legal document (merchant owner only).',
  })
  replaceRegistrationDocument(
    @Param('id') id: string,
    @UploadedFile()
    file?: { buffer: Buffer; originalname: string; size: number },
  ): Promise<RegistrationReview> {
    if (!file)
      throw new BadRequestException(
        'A legal registration document is required.',
      );
    return this.merchants.replaceRejectedRegistrationDocument(id, file);
  }

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

  @Get('platform/branch-approvals')
  @RequirePermissions('merchant.create')
  @ApiOperation({
    summary: 'List additional branches awaiting Super Admin approval.',
  })
  pendingBranchReviews(): Promise<PendingBranchReview[]> {
    return this.merchants.listPendingBranchReviews();
  }

  @Get('merchants/:id/branches')
  @RequirePermissions('branch.view')
  @ApiOperation({ summary: "List a merchant's branches." })
  async listBranches(@Param('id') id: string): Promise<SafeBranch[]> {
    const branches = await this.merchants.listBranches(id);
    // Two Vault reads per branch (creds + signing), all in parallel. Branch
    // counts are small (≤ a few dozen per merchant in practice); a batched
    // read would need a different KV layout.
    const [flags, signing] = await Promise.all([
      Promise.all(
        branches.map((b) => this.merchants.getBranchCredFlags(id, b.id)),
      ),
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

  @Post('merchants/:id/branches/:branchId/approve')
  @RequirePermissions('merchant.create')
  @ApiOperation({ summary: 'Approve a pending branch (super-admin only).' })
  async approveBranch(
    @Param('id') id: string,
    @Param('branchId') branchId: string,
  ): Promise<SafeBranch> {
    const branch = await this.merchants.approveBranch(id, branchId);
    return toSafeBranch(
      branch,
      await this.merchants.getBranchCredFlags(id, branch.id),
      await this.merchants.getBranchSigningFlags(id, branch.id),
    );
  }

  @Post('merchants/:id/branches/:branchId/reject')
  @RequirePermissions('merchant.create')
  @ApiOperation({ summary: 'Reject a pending branch (super-admin only).' })
  async rejectBranch(
    @Param('id') id: string,
    @Param('branchId') branchId: string,
    @Body() body: RejectMerchantDto,
  ): Promise<SafeBranch> {
    const branch = await this.merchants.rejectBranch(id, branchId, body);
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
  branchStats(@Param('id') id: string, @Param('branchId') branchId: string) {
    return this.merchants.branchStats(id, branchId);
  }

  @Post('merchants/:id/branches/:branchId/eirms/test')
  @RequirePermissions('branch.update')
  @ApiOperation({
    summary:
      'Force a fresh MoR login for this branch and return non-secret source identity claims.',
  })
  testBranchEirmsConnection(
    @Param('id') id: string,
    @Param('branchId') branchId: string,
  ) {
    return this.merchants.testBranchEirmsConnection(id, branchId);
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
