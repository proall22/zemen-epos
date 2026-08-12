import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../auth/require-permissions.decorator';
import {
  DashboardService,
  type AccountantSummary,
  type CashierSummary,
  type DashboardSummary,
  type SystemHealthSummary,
  type SystemSummary,
} from './dashboard.service';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) { }

  @Get()
  @RequirePermissions('dashboard.view')
  @ApiOperation({
    summary:
      "A single merchant's dashboard. Merchant users see their own; a SUPER_ADMIN reaches it only inside a consented merchant.",
  })
  summary(@Query('scope') scope?: string): Promise<DashboardSummary> {
    return this.dashboard.summary({ crossBranch: scope === 'merchant' });
  }

  @Get('system')
  @RequirePermissions('dashboard.system')
  @ApiOperation({
    summary:
      'Platform-wide aggregate for the SUPER_ADMIN — counts + top merchants by document volume, no per-merchant business detail.',
  })
  systemSummary(): Promise<SystemSummary> {
    return this.dashboard.systemSummary();
  }

  @Get('system/health')
  @RequirePermissions('dashboard.system')
  @ApiOperation({
    summary: 'Platform-wide health and metrics for the SUPER_ADMIN.',
  })
  systemHealth(): Promise<SystemHealthSummary> {
    return this.dashboard.systemHealth();
  }

  @Get('cashier')
  @RequirePermissions('dashboard.view')
  @ApiOperation({
    summary: 'Cashier-focused dashboard data.',
  })
  cashierSummary(@Query('scope') scope?: string): Promise<CashierSummary> {
    return this.dashboard.cashierSummary({ crossBranch: scope === 'merchant' });
  }

  @Get('accountant')
  @RequirePermissions('dashboard.view')
  @ApiOperation({
    summary: 'Accountant-focused financial dashboard data.',
  })
  accountantSummary(@Query('scope') scope?: string): Promise<AccountantSummary> {
    return this.dashboard.accountantSummary({ crossBranch: scope === 'merchant' });
  }
}
