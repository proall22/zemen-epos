import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { InventoryItem, StockMovement } from '@prisma/client';

import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { StockCountDto } from './dto/stock-count.dto';
import { WriteOffDto } from './dto/write-off.dto';
import {
  InventoryService,
  type InventoryItemWithStock,
  type ItemStockRow,
} from './inventory.service';

@ApiTags('Inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @RequirePermissions('inventory.view')
  @ApiOperation({
    summary:
      'List inventory items (active by default). Pass ?q= to fuzzy-search across code / SKU / UPC / description; results capped at 50.',
  })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Search term matched with ILIKE across the searchable columns.',
  })
  list(
    @Query('includeInactive') includeInactive?: string,
    @Query('q') q?: string,
  ): Promise<InventoryItemWithStock[]> {
    return this.inventory.list(includeInactive === 'true', q);
  }

  @Get('scan/:code')
  @RequirePermissions('inventory.view')
  @ApiOperation({
    summary:
      'Exact-match lookup for a scanned barcode (UPC > SKU > item code, in that order). 404 when nothing matches.',
  })
  async scan(@Param('code') code: string): Promise<InventoryItem> {
    const item = await this.inventory.scan(code);
    if (!item) {
      // Distinct 404 lets the frontend switch to the fuzzy-search fallback
      // without inspecting a magic "null" body.
      throw new NotFoundException(`No item found for barcode ${code}.`);
    }
    return item;
  }

  @Post()
  @RequirePermissions('inventory.create')
  create(@Body() body: CreateInventoryItemDto): Promise<InventoryItem> {
    return this.inventory.create(body);
  }

  @Get(':id')
  @RequirePermissions('inventory.view')
  get(@Param('id') id: string): Promise<InventoryItem> {
    return this.inventory.get(id);
  }

  @Patch(':id')
  @RequirePermissions('inventory.update')
  update(
    @Param('id') id: string,
    @Body() body: UpdateInventoryItemDto,
  ): Promise<InventoryItem> {
    return this.inventory.update(id, body);
  }

  @Post(':id/supersede')
  @RequirePermissions('inventory.update')
  @ApiOperation({
    summary: 'Replace an item with a new SKU (e.g. price change), keeping the link',
  })
  supersede(
    @Param('id') id: string,
    @Body() body: CreateInventoryItemDto,
  ): Promise<InventoryItem> {
    return this.inventory.supersede(id, body);
  }

  @Post(':id/stock-adjust')
  @RequirePermissions('inventory.update')
  @ApiOperation({ summary: 'Restock or correct on-hand quantity' })
  adjustStock(
    @Param('id') id: string,
    @Body() body: AdjustStockDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<InventoryItem> {
    return this.inventory.adjustStock(id, body, user.email);
  }

  @Post(':id/stock-count')
  @RequirePermissions('inventory.update')
  @ApiOperation({
    summary:
      'Physical stock take — set a store\'s on-hand to the counted figure. Use this to correct a drifted or negative balance.',
  })
  recordCount(
    @Param('id') id: string,
    @Body() body: StockCountDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<InventoryItem> {
    return this.inventory.recordCount(id, body, user.email);
  }

  @Get(':id/stock')
  @RequirePermissions('inventory.view')
  @ApiOperation({
    summary:
      'Per-store on-hand for one item, across the stores the caller can see.',
  })
  stock(@Param('id') id: string): Promise<ItemStockRow[]> {
    return this.inventory.stockByStore(id);
  }

  @Get(':id/movements')
  @RequirePermissions('inventory.view')
  @ApiOperation({ summary: 'Stock movement history for an item' })
  movements(@Param('id') id: string): Promise<StockMovement[]> {
    return this.inventory.listMovements(id);
  }

  @Post(':id/write-off')
  @RequirePermissions('writeoff.create')
  @ApiOperation({
    summary:
      'Remove units without a sale — damage / expiry / theft / internal use. Note is required.',
  })
  writeOff(
    @Param('id') id: string,
    @Body() body: WriteOffDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<InventoryItem> {
    return this.inventory.writeOff(id, body, user.email);
  }
}
