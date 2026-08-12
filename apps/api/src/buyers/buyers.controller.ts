import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Buyer } from '@prisma/client';

import { RequirePermissions } from '../auth/require-permissions.decorator';
import { BuyersService } from './buyers.service';
import { CreateBuyerDto } from './dto/create-buyer.dto';

@ApiTags('Buyers')
@Controller('buyers')
export class BuyersController {
  constructor(private readonly buyers: BuyersService) {}

  @Get()
  @RequirePermissions('buyer.view')
  @ApiOperation({ summary: 'List saved buyers (most recently updated first)' })
  list(): Promise<Buyer[]> {
    return this.buyers.list();
  }

  @Post()
  @RequirePermissions('buyer.create')
  @ApiOperation({ summary: 'Create a buyer' })
  create(@Body() body: CreateBuyerDto): Promise<Buyer> {
    return this.buyers.create(body);
  }

  @Get(':id')
  @RequirePermissions('buyer.view')
  async get(@Param('id') id: string): Promise<Buyer> {
    const buyer = await this.buyers.get(id);
    if (!buyer) throw new NotFoundException(`Buyer ${id} not found`);
    return buyer;
  }
}
