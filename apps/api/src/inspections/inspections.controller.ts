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
import { InspectionsService } from './inspections.service';
import type { InspectionsQuery } from './inspections.types';

@Controller('inspections')
@UseGuards(SessionAuthGuard, PortalUserGuard)
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() query: InspectionsQuery) {
    const context = sessionContext(request);
    return this.inspections.list(context.userId, context.sessionId, query);
  }

  @Get(':id')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const context = sessionContext(request);
    return this.inspections.get(context.userId, context.sessionId, id);
  }
}

function sessionContext(request: AuthenticatedRequest) {
  if (!request.currentUser || !request.currentSessionId) {
    throw new UnauthorizedException();
  }
  return { userId: request.currentUser.id, sessionId: request.currentSessionId };
}
