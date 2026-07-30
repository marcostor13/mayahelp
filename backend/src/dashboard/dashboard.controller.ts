import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getStats(user);
  }

  /** Stats + projects of the signed-in person, for the account screen. */
  @Get('account')
  getAccount(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getAccountSummary(user);
  }
}
