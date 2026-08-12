import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { HarmonizationCode } from '@prisma/client';

import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CreateHarmonizationCodeDto } from './dto/create-harmonization-code.dto';
import { UpdateHarmonizationCodeDto } from './dto/update-harmonization-code.dto';
import { HarmonizationService } from './harmonization.service';

@ApiTags('Harmonization codes')
@Controller('harmonization-codes')
export class HarmonizationController {
  constructor(private readonly codes: HarmonizationService) {}

  @Get()
  @RequirePermissions('inventory.view')
  @ApiOperation({
    summary: 'List the merchant’s harmonization codes and their excise rates.',
  })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  list(
    @Query('includeInactive') includeInactive?: string,
  ): Promise<HarmonizationCode[]> {
    return this.codes.list(includeInactive === 'true');
  }

  @Post()
  @RequirePermissions('inventory.create')
  create(
    @Body() body: CreateHarmonizationCodeDto,
  ): Promise<HarmonizationCode> {
    return this.codes.create(body);
  }

  @Get(':id')
  @RequirePermissions('inventory.view')
  get(@Param('id') id: string): Promise<HarmonizationCode> {
    return this.codes.get(id);
  }

  @Patch(':id')
  @RequirePermissions('inventory.update')
  update(
    @Param('id') id: string,
    @Body() body: UpdateHarmonizationCodeDto,
  ): Promise<HarmonizationCode> {
    return this.codes.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions('inventory.delete')
  remove(@Param('id') id: string): Promise<HarmonizationCode> {
    return this.codes.remove(id);
  }
}
