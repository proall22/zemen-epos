import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { PurchasesService } from './purchases.service';

@ApiTags('Purchases')
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get()
  @RequirePermissions('purchase.view')
  @ApiOperation({
    summary:
      'List goods-received records. Cashiers see their branch only; admins see the whole merchant. Latest 200.',
  })
  list(@Query('vendorId') vendorId?: string) {
    return this.purchases.list({ vendorId });
  }

  @Post()
  @RequirePermissions('purchase.create')
  @ApiOperation({
    summary:
      'Record a purchase — writes header + N line items + N stock movements + increments the per-store on-hand + updates avgCost in one transaction.',
  })
  create(
    @Body() body: CreatePurchaseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.purchases.create(body, user.email);
  }

  @Get(':id')
  @RequirePermissions('purchase.view')
  get(@Param('id') id: string) {
    return this.purchases.get(id);
  }
}
