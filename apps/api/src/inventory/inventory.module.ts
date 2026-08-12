import { Module } from '@nestjs/common';

import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { MovementsController } from './movements.controller';
import { MovementsService } from './movements.service';

@Module({
  controllers: [InventoryController, MovementsController],
  providers: [InventoryService, MovementsService],
  exports: [InventoryService, MovementsService],
})
export class InventoryModule {}
