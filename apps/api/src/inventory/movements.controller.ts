import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { StockMovementReason } from '@prisma/client';

import { RequirePermissions } from '../auth/require-permissions.decorator';
import { MovementsService, type MovementPage } from './movements.service';

@ApiTags('Inventory')
@Controller('stock-movements')
export class MovementsController {
  constructor(private readonly movements: MovementsService) {}

  @Get()
  // inventory.view, not audit.view — stock keepers must be able to trace stock
  // without being handed the platform audit trail.
  @RequirePermissions('inventory.view')
  @ApiOperation({
    summary:
      'Stock ledger for the active branch: sales, restocks, transfers, write-offs and adjustments.',
  })
  @ApiQuery({ name: 'storeId', required: false })
  @ApiQuery({ name: 'inventoryItemId', required: false })
  @ApiQuery({ name: 'reason', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(
    @Query('storeId') storeId?: string,
    @Query('inventoryItemId') inventoryItemId?: string,
    @Query('reason') reason?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<MovementPage> {
    return this.movements.query({
      storeId: storeId?.trim() || undefined,
      inventoryItemId: inventoryItemId?.trim() || undefined,
      reason: (reason?.trim() as StockMovementReason) || undefined,
      from: from?.trim() || undefined,
      to: to?.trim() || undefined,
      cursor: cursor?.trim() || undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
