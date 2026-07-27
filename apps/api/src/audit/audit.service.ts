import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { AuditOutcome } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AuditPage,
  AuditQuery,
  RecordAuditEvent,
} from './audit.types';

type AuditWriter = Pick<Prisma.TransactionClient, 'auditEvent'>;

const forbiddenMetadataKeys =
  /password|temporarypassword|passwordhash|cookie|sessiontoken|tokenhash|authorization|database_url|secret|api[_-]?key/i;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(
    event: RecordAuditEvent,
    client: AuditWriter = this.prisma,
  ) {
    return client.auditEvent.create({
      data: {
        actorId: event.actorId ?? null,
        action: event.action,
        outcome: event.outcome,
        entityType: event.entityType ?? null,
        entityId: event.entityId ?? null,
        hospitalId: event.hospitalId ?? null,
        metadata:
          event.metadata === undefined || event.metadata === null
            ? undefined
            : (sanitizeMetadata(event.metadata) as Prisma.InputJsonValue),
        ipAddress: event.ipAddress ?? null,
        userAgent: event.userAgent ?? null,
        requestId: event.requestId ?? null,
      },
    });
  }

  async list(query: AuditQuery): Promise<AuditPage> {
    const page = positiveInteger(query.page, 'page', 1);
    const pageSize = positiveInteger(query.pageSize, 'pageSize', 25, 100);
    const search = query.search?.trim();
    const outcome = optionalOutcome(query.outcome);
    const hospitalId = optionalUuid(query.hospitalId, 'hospitalId');
    const actorId = optionalUuid(query.actorId, 'actorId');
    const dateFrom = optionalDate(query.dateFrom, 'dateFrom');
    const dateTo = optionalDate(query.dateTo, 'dateTo');

    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new BadRequestException(
        'Data początkowa nie może być późniejsza od końcowej.',
      );
    }

    const where: Prisma.AuditEventWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(outcome ? { outcome } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(hospitalId ? { hospitalId } : {}),
      ...(actorId ? { actorId } : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { actor: { email: { contains: search, mode: 'insensitive' } } },
              { action: { contains: search, mode: 'insensitive' } },
              ...(isUuid(search) ? [{ entityId: search }] : []),
              { requestId: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    try {
      const [items, totalCount] = await this.prisma.$transaction([
        this.prisma.auditEvent.findMany({
          where,
          select: {
            id: true,
            action: true,
            outcome: true,
            actor: { select: { id: true, email: true } },
            entityType: true,
            entityId: true,
            hospital: { select: { id: true, name: true } },
            metadata: true,
            ipAddress: true,
            userAgent: true,
            requestId: true,
            createdAt: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.auditEvent.count({ where }),
      ]);
      return { items, page, pageSize, totalCount };
    } catch {
      throw new ServiceUnavailableException(
        'Nie udało się pobrać dziennika audytowego.',
      );
    }
  }
}

export function sanitizeMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeMetadata);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !forbiddenMetadataKeys.test(key))
        .map(([key, nested]) => [key, sanitizeMetadata(nested)]),
    );
  }
  return value;
}

function positiveInteger(
  value: string | undefined,
  field: string,
  fallback: number,
  max?: number,
): number {
  if (!value) return fallback;
  if (!/^\d+$/.test(value)) {
    throw new BadRequestException(`Parametr ${field} jest nieprawidłowy.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || (max && parsed > max)) {
    throw new BadRequestException(`Parametr ${field} jest nieprawidłowy.`);
  }
  return parsed;
}

function optionalOutcome(value?: string): AuditOutcome | undefined {
  if (!value) return undefined;
  if (value !== AuditOutcome.SUCCESS && value !== AuditOutcome.FAILURE) {
    throw new BadRequestException('Parametr outcome jest nieprawidłowy.');
  }
  return value;
}

function optionalUuid(value: string | undefined, field: string) {
  if (!value) return undefined;
  if (!isUuid(value)) {
    throw new BadRequestException(`Parametr ${field} jest nieprawidłowy.`);
  }
  return value;
}

function optionalDate(value: string | undefined, field: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`Parametr ${field} jest nieprawidłowy.`);
  }
  return date;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
