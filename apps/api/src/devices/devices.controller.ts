import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { PortalUserGuard } from '../portal-hospitals/portal-user.guard';
import { DepartmentsService } from './departments.service';
import { DevicesService } from './devices.service';
import type { DevicesQuery } from './devices.types';

@Controller()
@UseGuards(SessionAuthGuard, PortalUserGuard)
export class DevicesController {
  constructor(
    private readonly devices: DevicesService,
    private readonly departments: DepartmentsService,
  ) {}

  @Get('devices')
  list(@Req() request: AuthenticatedRequest, @Query() query: DevicesQuery) {
    const context = sessionContext(request);
    return this.devices.list(context.userId, context.sessionId, query);
  }

  @Get('devices/:id')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const context = sessionContext(request);
    return this.devices.get(context.userId, context.sessionId, id);
  }

  @Get('departments')
  listDepartments(@Req() request: AuthenticatedRequest) {
    const context = sessionContext(request);
    return this.departments.list(context.userId, context.sessionId);
  }
}

function sessionContext(request: AuthenticatedRequest) {
  if (!request.currentUser || !request.currentSessionId) {
    throw new UnauthorizedException();
  }
  return {
    userId: request.currentUser.id,
    sessionId: request.currentSessionId,
  };
}
