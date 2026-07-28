import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { EmmaAdminGuard } from '../admin-hospitals/emma-admin.guard';
import { NotificationEventService } from './notification-event.service';
import type { AdminEmailsQuery } from './notifications.types';

@Controller('admin/emails')
@UseGuards(SessionAuthGuard, EmmaAdminGuard)
export class AdminEmailsController {
  constructor(private readonly events: NotificationEventService) {}

  @Get()
  list(@Query() query: AdminEmailsQuery) {
    return this.events.list(query);
  }

  @Get(':eventId')
  get(@Param('eventId') eventId: string) {
    return this.events.get(eventId);
  }

  @Post(':eventId/reprocess')
  reprocess(@Param('eventId') eventId: string, @Req() request: AuthenticatedRequest) {
    return this.events.reprocess(eventId, request.currentUser?.id);
  }
}
