import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { ConsentService, type SafeConsentGrant } from './consent.service';
import { AcceptConsentDto } from './dto/accept-consent.dto';
import { RequestConsentDto } from './dto/request-consent.dto';

@ApiTags('Consent')
@Controller('consent')
export class ConsentController {
  constructor(private readonly consent: ConsentService) {}

  // ----- Super-admin: request + track --------------------------------------

  @Post('requests')
  @RequirePermissions('consent.request')
  @ApiOperation({
    summary:
      'SUPER_ADMIN requests time-limited, scoped access to a merchant. Emails the merchant admins a decision link.',
  })
  request(
    @CurrentUser() user: JwtPayload,
    @Body() body: RequestConsentDto,
  ): Promise<SafeConsentGrant> {
    return this.consent.requestAccess(user.sub, {
      merchantId: body.merchantId,
      scopes: body.scopes,
      proposedMinutes: body.proposedMinutes,
    });
  }

  @Get('requests')
  @RequirePermissions('consent.manage')
  @ApiOperation({ summary: "The requesting SUPER_ADMIN's own grants." })
  listMine(@CurrentUser() user: JwtPayload): Promise<SafeConsentGrant[]> {
    return this.consent.listMine(user.sub);
  }

  // ----- Merchant admin: decide (magic link target) ------------------------
  // These carry no permission code — authorization is MERCHANT_ADMIN
  // membership of the grant's merchant, enforced inside the service.

  @Get('requests/:token')
  @ApiOperation({
    summary:
      'Decision-page payload for the merchant admin who opened the magic link.',
  })
  forDecision(
    @CurrentUser() user: JwtPayload,
    @Param('token') token: string,
  ): Promise<SafeConsentGrant & { merchantName: string; requesterEmail: string }> {
    return this.consent.getForDecision(token, user);
  }

  @Post('requests/:token/accept')
  @ApiOperation({ summary: 'Merchant admin approves the request.' })
  accept(
    @CurrentUser() user: JwtPayload,
    @Param('token') token: string,
    @Body() body: AcceptConsentDto,
  ): Promise<SafeConsentGrant> {
    return this.consent.accept(token, user, body.grantedMinutes);
  }

  @Post('requests/:token/reject')
  @ApiOperation({ summary: 'Merchant admin declines the request.' })
  reject(
    @CurrentUser() user: JwtPayload,
    @Param('token') token: string,
  ): Promise<SafeConsentGrant> {
    return this.consent.reject(token, user);
  }

  // ----- Merchant admin: oversight -----------------------------------------

  @Get('granted')
  @ApiOperation({
    summary: 'Grants targeting the caller\'s merchant (who has platform access).',
  })
  granted(@CurrentUser() user: JwtPayload): Promise<SafeConsentGrant[]> {
    return this.consent.listForMerchant(user);
  }

  @Post('granted/:id/revoke')
  @ApiOperation({
    summary: 'Merchant admin cuts off an active or pending grant early.',
  })
  revoke(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<SafeConsentGrant> {
    return this.consent.revoke(id, user);
  }
}
