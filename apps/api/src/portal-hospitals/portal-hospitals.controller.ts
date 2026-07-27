import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { CurrentHospital } from './current-hospital-scope.service';
import { PortalHospitalsService } from './portal-hospitals.service';
import type { AvailableHospitalsResponse } from './portal-hospitals.service';
import { PortalUserGuard } from './portal-user.guard';

@Controller()
@UseGuards(SessionAuthGuard, PortalUserGuard)
export class PortalHospitalsController {
  constructor(
    private readonly hospitalsService: PortalHospitalsService,
  ) {}

  @Get('hospitals')
  list(
    @Req() request: AuthenticatedRequest,
  ): Promise<AvailableHospitalsResponse> {
    const context = requireSessionContext(request);
    return this.hospitalsService.list(context.userId, context.sessionId);
  }

  @Patch('me/active-hospital')
  setActiveHospital(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<CurrentHospital> {
    const context = requireSessionContext(request);
    return this.hospitalsService.setActiveHospital(
      context.userId,
      context.sessionId,
      body,
    );
  }
}

function requireSessionContext(request: AuthenticatedRequest): {
  userId: string;
  sessionId: string;
} {
  if (!request.currentUser || !request.currentSessionId) {
    throw new UnauthorizedException();
  }

  return {
    userId: request.currentUser.id,
    sessionId: request.currentSessionId,
  };
}
