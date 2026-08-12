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
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { UpsertReservationsDto } from './dto/reservation.dto';
import { ReservationsService } from './reservations.service';

@ApiTags('POS Reservations')
@Controller('pos/reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post()
  @RequirePermissions('invoice.create')
  @ApiOperation({
    summary:
      'Reserve stock for a POS cart. Refuses (409) any line that would over-reserve given other cashiers\' active reservations.',
  })
  upsert(
    @Body() body: UpsertReservationsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.reservations.upsert(body, user.email);
  }

  @Patch(':cartSessionId/heartbeat')
  @RequirePermissions('invoice.create')
  @ApiOperation({ summary: 'Extend the 10 min TTL on this cart\'s reservations.' })
  heartbeat(@Param('cartSessionId') cartSessionId: string) {
    return this.reservations.heartbeat(cartSessionId);
  }

  @Delete(':cartSessionId')
  @RequirePermissions('invoice.create')
  @ApiOperation({ summary: 'Release every reservation for a cart session.' })
  release(@Param('cartSessionId') cartSessionId: string) {
    return this.reservations.release(cartSessionId);
  }

  @Get('summary')
  @RequirePermissions('invoice.create')
  @ApiOperation({
    summary:
      'On-hand + reserved + available snapshot for a single item at the caller branch\'s sales-floor store. Pass ?cartSessionId= to exclude the caller\'s own reservations.',
  })
  summary(
    @Query('inventoryItemId') inventoryItemId: string,
    @Query('cartSessionId') cartSessionId?: string,
  ) {
    return this.reservations.summary(inventoryItemId, cartSessionId);
  }
}
