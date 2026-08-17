import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { InventoryCategory, InventoryItem, StockMovement } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { Public } from '../auth/public.decorator';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateInventoryCategoryDto } from './dto/create-inventory-category.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { StockCountDto } from './dto/stock-count.dto';
import { WriteOffDto } from './dto/write-off.dto';
import {
  InventoryService,
  type InventoryItemWithStock,
  type InventoryPage,
  type ItemStockRow,
} from './inventory.service';

@ApiTags('Inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('page')
  @RequirePermissions('inventory.view')
  paged(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
    @Query('categoryId') categoryId?: string,
  ): Promise<InventoryPage> {
    return this.inventory.page(Number(page) || 1, Number(pageSize) || 10, q, categoryId);
  }

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
    @Query('categoryId') categoryId?: string,
  ): Promise<InventoryItemWithStock[]> {
    return this.inventory.list(includeInactive === 'true', q, categoryId);
  }

  @Get('categories')
  @RequirePermissions('inventory.view')
  listCategories(): Promise<InventoryCategory[]> {
    return this.inventory.listCategories();
  }

  @Post('categories')
  @RequirePermissions('inventory.create')
  createCategory(
    @Body() body: CreateInventoryCategoryDto,
  ): Promise<InventoryCategory> {
    return this.inventory.createCategory(body);
  }

  @Post('images')
  @RequirePermissions('inventory.create')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadImage(
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; originalname: string },
  ): Promise<{ path: string }> {
    if (!file) throw new BadRequestException('Choose an image to upload.');
    const allowed = new Map([
      ['image/jpeg', '.jpg'],
      ['image/png', '.png'],
      ['image/webp', '.webp'],
      ['image/gif', '.gif'],
    ]);
    const extension = allowed.get(file.mimetype);
    if (!extension) {
      throw new BadRequestException('Only JPEG, PNG, WebP, and GIF images are allowed.');
    }
    const directory = process.env.IMAGE_UPLOAD_DIR || join(process.cwd(), 'uploads', 'inventory');
    await mkdir(directory, { recursive: true });
    const filename = `${randomUUID()}${extension}`;
    await writeFile(join(directory, filename), file.buffer, { flag: 'wx' });
    return { path: `/inventory/images/${filename}` };
  }

  @Get('images/:filename')
  @Public()
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async image(@Param('filename') filename: string): Promise<StreamableFile> {
    if (!/^[0-9a-f-]+\.(?:jpg|png|webp|gif)$/i.test(filename) || extname(filename) === '') {
      throw new NotFoundException('Image not found.');
    }
    const directory = process.env.IMAGE_UPLOAD_DIR || join(process.cwd(), 'uploads', 'inventory');
    try {
      const bytes = await readFile(join(directory, filename));
      const contentTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
      };
      return new StreamableFile(bytes, {
        type: contentTypes[extname(filename).toLowerCase()] ?? 'application/octet-stream',
      });
    } catch {
      throw new NotFoundException('Image not found.');
    }
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
