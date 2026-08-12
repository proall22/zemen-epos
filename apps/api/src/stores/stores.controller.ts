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
import type { Store } from '@prisma/client';

import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CreateStoreDto } from './dto/create-store.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { StoresService, type StoreStockRow } from './stores.service';

@ApiTags('Stores')
@Controller('stores')
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Get()
  @RequirePermissions('store.view')
  @ApiOperation({
    summary:
      'List stores visible to the caller. Cashiers see their branch only; admins see every store in the merchant.',
  })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiQuery({
    name: 'branchId',
    required: false,
    description: 'Narrow to one branch. Cashiers may only pass their own.',
  })
  list(
    @Query('includeInactive') includeInactive?: string,
    @Query('branchId') branchId?: string,
  ): Promise<Store[]> {
    return this.stores.list(includeInactive === 'true', branchId?.trim() || undefined);
  }

  @Post()
  @RequirePermissions('store.create')
  create(@Body() body: CreateStoreDto): Promise<Store> {
    return this.stores.create(body);
  }

  @Post('transfers')
  @RequirePermissions('store.update')
  @ApiOperation({
    summary:
      'Move stock between two stores in the same branch. Writes a paired TRANSFER_OUT / TRANSFER_IN in one transaction.',
  })
  transfer(
    @Body() body: TransferStockDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.stores.transfer(body, user.email);
  }

  @Get(':id/stock')
  @RequirePermissions('store.view')
  @ApiOperation({
    summary:
      'Items held in this store with on-hand, live POS reservations, and what is actually sellable.',
  })
  @ApiQuery({ name: 'q', required: false })
  stock(
    @Param('id') id: string,
    @Query('q') q?: string,
  ): Promise<StoreStockRow[]> {
    return this.stores.stock(id, q);
  }

  @Get(':id')
  @RequirePermissions('store.view')
  get(@Param('id') id: string): Promise<Store> {
    return this.stores.get(id);
  }

  @Patch(':id')
  @RequirePermissions('store.update')
  update(
    @Param('id') id: string,
    @Body() body: UpdateStoreDto,
  ): Promise<Store> {
    return this.stores.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions('store.delete')
  @ApiOperation({
    summary:
      'Soft-delete (active=false). Refuses if the store still holds stock or is the branch default.',
  })
  remove(@Param('id') id: string): Promise<Store> {
    return this.stores.remove(id);
  }
}
