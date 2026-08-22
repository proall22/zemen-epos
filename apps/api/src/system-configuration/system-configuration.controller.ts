import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../auth/require-permissions.decorator';
import {
  CalculateWithholdingDto,
  CreateTaxCodeDto,
  UpdateSystemRuleDto,
  UpdateTaxCodeDto,
} from './dto/system-configuration.dto';
import { SystemConfigurationService } from './system-configuration.service';

@ApiTags('System Configuration')
@Controller('system-configuration')
export class SystemConfigurationController {
  constructor(private readonly configuration: SystemConfigurationService) {}

  @Get('tax-codes')
  @RequirePermissions('configuration.view')
  taxCodes(@Query('includeInactive') includeInactive?: string) {
    return this.configuration.listTaxCodes(includeInactive !== 'false');
  }

  /** Global master data needed by inventory/POS selectors. Authentication is
   * still enforced globally; unlike the management route this exposes only
   * active codes and grants no mutation capability. */
  @Get('active-tax-codes')
  activeTaxCodes() {
    return this.configuration.listTaxCodes(false);
  }

  @Post('tax-codes')
  @RequirePermissions('configuration.manage')
  createTaxCode(@Body() body: CreateTaxCodeDto) {
    return this.configuration.createTaxCode(body);
  }

  @Patch('tax-codes/:id')
  @RequirePermissions('configuration.manage')
  updateTaxCode(@Param('id') id: string, @Body() body: UpdateTaxCodeDto) {
    return this.configuration.updateTaxCode(id, body);
  }

  @Get('rules')
  @RequirePermissions('configuration.view')
  rules() {
    return this.configuration.listRules();
  }

  @Patch('rules/:code')
  @RequirePermissions('configuration.manage')
  updateRule(@Param('code') code: string, @Body() body: UpdateSystemRuleDto) {
    return this.configuration.updateRule(code, body);
  }

  @Post('withholding/calculate')
  @RequirePermissions('withholding.create')
  calculateWithholding(@Body() body: CalculateWithholdingDto) {
    return this.configuration.withholding(body.preTaxAmount, body.nature);
  }
}
