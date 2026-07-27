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
import { RepairsService } from './repairs.service';
import type { RepairsQuery } from './repairs.types';

@Controller('repairs')
@UseGuards(SessionAuthGuard, PortalUserGuard)
export class RepairsController {
  constructor(private readonly repairs: RepairsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() query: RepairsQuery) {
    const context = sessionContext(request);
    return this.repairs.list(context.userId, context.sessionId, query);
  }

  @Get(':id')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const context = sessionContext(request);
    return this.repairs.get(context.userId, context.sessionId, id);
  }
}

function sessionContext(request: AuthenticatedRequest) {
  if (!request.currentUser || !request.currentSessionId) {
    throw new UnauthorizedException();
  }
  return { userId: request.currentUser.id, sessionId: request.currentSessionId };
}
