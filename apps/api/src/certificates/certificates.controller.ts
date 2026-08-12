import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { RequirePermissions } from '../auth/require-permissions.decorator';
import {
  type CertificateStatus,
  CertificatesService,
} from './certificates.service';
import { UpdateCertificateFormDto } from './dto/update-certificate-form.dto';
import { UploadCertificatePemDto } from './dto/upload-certificate.dto';

@ApiTags('Certificates')
@Controller()
export class CertificatesController {
  constructor(private readonly certs: CertificatesService) {}

  @Get('merchants/:merchantId/certificates')
  @RequirePermissions('branch.view')
  @ApiOperation({
    summary:
      "Diagnostic: cert onboarding state for every branch of the merchant. Shows which branches have a private key, CSR, and INSA cert — used by the wizard to explain sibling-cert signing.",
  })
  listMerchantState(@Param('merchantId') merchantId: string) {
    return this.certs.listMerchantCertificateState(merchantId);
  }
}

@ApiTags('Certificates')
@Controller('merchants/:merchantId/branches/:branchId/certificate')
export class BranchCertificatesController {
  constructor(private readonly certs: CertificatesService) {}

  @Get()
  @RequirePermissions('branch.view')
  @ApiOperation({
    summary: 'Get the certificate-onboarding status for a branch.',
    description:
      'Returns flags for each step of the wizard (key generated, CSR ready, request sent, cert issued) plus the editable form fields and the target email.',
  })
  status(
    @Param('merchantId') merchantId: string,
    @Param('branchId') branchId: string,
  ): Promise<CertificateStatus> {
    return this.certs.getStatus(merchantId, branchId);
  }

  @Patch('form')
  @RequirePermissions('branch.update')
  @ApiOperation({
    summary:
      'Update the CERTIFICATE REQUEST FORM DOCX fields (contact + reason). Rejected once the request has been marked submitted.',
  })
  updateForm(
    @Param('merchantId') merchantId: string,
    @Param('branchId') branchId: string,
    @Body() body: UpdateCertificateFormDto,
  ): Promise<CertificateStatus> {
    return this.certs.updateForm(merchantId, branchId, body);
  }

  @Post('submit')
  @RequirePermissions('branch.update')
  @ApiOperation({
    summary:
      'Mark the certificate request as sent to INSA. Idempotent — calling twice is a no-op.',
  })
  submit(
    @Param('merchantId') merchantId: string,
    @Param('branchId') branchId: string,
  ): Promise<CertificateStatus> {
    return this.certs.markSubmitted(merchantId, branchId);
  }

  @Post('pem')
  @RequirePermissions('branch.update')
  @ApiOperation({
    summary:
      'Upload the INSA-issued .pem for this branch. Verifies the pubkey match + CN before storing.',
  })
  upload(
    @Param('merchantId') merchantId: string,
    @Param('branchId') branchId: string,
    @Body() body: UploadCertificatePemDto,
  ): Promise<CertificateStatus> {
    return this.certs.uploadPem(merchantId, branchId, body);
  }

  @Get('request.csr')
  @RequirePermissions('branch.view')
  @ApiOperation({ summary: 'Download the generated CSR (PEM).' })
  async downloadCsr(
    @Param('merchantId') merchantId: string,
    @Param('branchId') branchId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { pem, filename } = await this.certs.downloadCsr(
      merchantId,
      branchId,
    );
    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.send(pem);
  }

  @Get('request-form.docx')
  @RequirePermissions('branch.view')
  @ApiOperation({
    summary:
      'Download the CERTIFICATE REQUEST FORM DOCX pre-filled from Merchant + Branch + form fields.',
  })
  async downloadDocx(
    @Param('merchantId') merchantId: string,
    @Param('branchId') branchId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.certs.downloadRequestForm(
      merchantId,
      branchId,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.send(buffer);
  }
}
