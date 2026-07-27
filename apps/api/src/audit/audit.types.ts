import type { AuditOutcome } from '../generated/prisma/enums';

export interface AuditRequestContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export interface RecordAuditEvent extends AuditRequestContext {
  actorId?: string | null;
  action: string;
  outcome: AuditOutcome;
  entityType?: string | null;
  entityId?: string | null;
  hospitalId?: string | null;
  metadata?: unknown;
}

export interface AuditQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  action?: string;
  outcome?: string;
  entityType?: string;
  hospitalId?: string;
  actorId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AuditPage {
  items: Array<{
    id: string;
    action: string;
    outcome: AuditOutcome;
    actor: { id: string; email: string } | null;
    entityType: string | null;
    entityId: string | null;
    hospital: { id: string; name: string } | null;
    metadata: unknown;
    ipAddress: string | null;
    userAgent: string | null;
    requestId: string | null;
    createdAt: Date;
  }>;
  page: number;
  pageSize: number;
  totalCount: number;
}
