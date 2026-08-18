import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { eirmsConfig } from '../eirms/eirms.config';
import { EirmsModule } from '../eirms/eirms.module';
import {
  BranchCertificatesController,
  CertificatesController,
} from './certificates.controller';
import { CertificatesService } from './certificates.service';

/** Global so MerchantsService can resolve CertificatesService for the
 *  approval / branch-create hooks without an explicit forwardRef. */
@Global()
@Module({
  imports: [ConfigModule.forFeature(eirmsConfig), EirmsModule],
  controllers: [CertificatesController, BranchCertificatesController],
  providers: [CertificatesService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
