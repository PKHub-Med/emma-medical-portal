import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { EmmaAdminGuard } from '../admin-hospitals/emma-admin.guard';
import { auditContextFromRequest } from '../audit/audit-request';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { StatusMappingService } from './status-mapping.service';
import type { StatusMappingItem, StatusMappingsPage, StatusMappingsQuery } from './status-mappings.types';

@Controller('admin/statuses')
@UseGuards(SessionAuthGuard, EmmaAdminGuard)
export class StatusMappingsController {
  constructor(private readonly statusMappings: StatusMappingService) {}

  @Get()
  list(@Query() query: StatusMappingsQuery): Promise<StatusMappingsPage> {
    return this.statusMappings.list(query);
  }

  @Post()
  create(@Body() body: unknown, @Req() request?: AuthenticatedRequest): Promise<StatusMappingItem> {
    return this.statusMappings.create(
      body,
      request?.currentUser?.id,
      request ? auditContextFromRequest(request) : {},
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request?: AuthenticatedRequest,
  ): Promise<StatusMappingItem> {
    return this.statusMappings.update(
      id,
      body,
      request?.currentUser?.id,
      request ? auditContextFromRequest(request) : {},
    );
  }
}
