import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { EmmaAdminGuard } from '../admin-hospitals/emma-admin.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuditService } from './audit.service';
import type { AuditPage, AuditQuery } from './audit.types';

@Controller('admin/audit')
@UseGuards(SessionAuthGuard, EmmaAdminGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(@Query() query: AuditQuery): Promise<AuditPage> {
    return this.auditService.list(query);
  }
}
