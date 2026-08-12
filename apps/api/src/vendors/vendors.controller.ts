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
import type { Vendor } from '@prisma/client';

import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { VendorsService } from './vendors.service';

@ApiTags('Vendors')
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get()
  @RequirePermissions('vendor.view')
  @ApiOperation({ summary: 'List vendors visible to the caller (merchant-scoped).' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  list(@Query('includeInactive') includeInactive?: string): Promise<Vendor[]> {
    return this.vendors.list(includeInactive === 'true');
  }

  @Post()
  @RequirePermissions('vendor.create')
  create(@Body() body: CreateVendorDto): Promise<Vendor> {
    return this.vendors.create(body);
  }

  @Get(':id')
  @RequirePermissions('vendor.view')
  get(@Param('id') id: string): Promise<Vendor> {
    return this.vendors.get(id);
  }

  @Patch(':id')
  @RequirePermissions('vendor.update')
  update(
    @Param('id') id: string,
    @Body() body: UpdateVendorDto,
  ): Promise<Vendor> {
    return this.vendors.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions('vendor.delete')
  remove(@Param('id') id: string): Promise<Vendor> {
    return this.vendors.remove(id);
  }
}
