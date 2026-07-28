import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { PortalUserGuard } from '../portal-hospitals/portal-user.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(SessionAuthGuard, PortalUserGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(@Req() request: AuthenticatedRequest) {
    if (!request.currentUser || !request.currentSessionId) {
      throw new UnauthorizedException();
    }

    return this.dashboard.summary(
      request.currentUser.id,
      request.currentSessionId,
    );
  }
}
