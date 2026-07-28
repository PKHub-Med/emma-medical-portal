import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import {
  AuditOutcome,
  StatusMappingSourceEntityType,
} from '../generated/prisma/enums';
import { AuditService } from '../audit/audit.service';
import type { AuditRequestContext } from '../audit/audit.types';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ResolvedStatusMapping,
  StatusMappingItem,
  StatusMappingsPage,
  StatusMappingsQuery,
} from './status-mappings.types';

const selection = {
  id: true,
  sourceEntityType: true,
  sourceStatus: true,
  customerStatusCode: true,
  customerLabel: true,
  emailTemplateId: true,
  sendEmail: true,
  isTerminal: true,
  requiresAction: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

type MappingData = Omit<StatusMappingItem, 'id' | 'createdAt' | 'updatedAt'>;
type UpdateData = Partial<Omit<MappingData, 'sourceEntityType'>>;

@Injectable()
export class StatusMappingService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  async list(query: StatusMappingsQuery): Promise<StatusMappingsPage> {
    const page = positiveInteger(query.page, 'page', 1);
    const pageSize = positiveInteger(query.pageSize, 'pageSize', 25, 100);
    const search = query.search?.trim();
    const sourceEntityType = optionalEntityType(query.sourceEntityType);
    const active = optionalBoolean(query.active, 'active');
    const sendEmail = optionalBoolean(query.sendEmail, 'sendEmail');

    if (search && search.length > 200) {
      throw new BadRequestException('Wyszukiwanie może mieć maksymalnie 200 znaków.');
    }

    const where: Prisma.StatusMappingWhereInput = {
      ...(search
        ? {
            OR: [
              { sourceStatus: { contains: search, mode: 'insensitive' } },
              { customerStatusCode: { contains: search, mode: 'insensitive' } },
              { customerLabel: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(sourceEntityType ? { sourceEntityType } : {}),
      ...(active === undefined ? {} : { active }),
      ...(sendEmail === undefined ? {} : { sendEmail }),
    };

    try {
      const [items, totalCount] = await this.prisma.$transaction([
        this.prisma.statusMapping.findMany({
          where,
          select: selection,
          orderBy: [
            { sourceEntityType: 'asc' },
            { sourceStatus: 'asc' },
            { id: 'asc' },
          ],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.statusMapping.count({ where }),
      ]);
      return { items, page, pageSize, totalCount };
    } catch {
      throw new ServiceUnavailableException(
        'Nie udało się pobrać mapowań statusów.',
      );
    }
  }

  async create(
    body: unknown,
    actorId?: string,
    requestContext: AuditRequestContext = {},
  ): Promise<StatusMappingItem> {
    const data = parseCreateBody(body);
    await this.ensureUnique(data.sourceEntityType, data.sourceStatus);

    try {
      const create = (client: typeof this.prisma) =>
        client.statusMapping.create({ data, select: selection });
      if (!this.auditService || !actorId) return await create(this.prisma);

      return await this.prisma.$transaction(async (tx) => {
        const created = await create(tx as typeof this.prisma);
        const changedFields = Object.keys(data);
        await this.auditService!.record(
          {
            actorId,
            action: 'STATUS_MAPPING_CREATED',
            outcome: AuditOutcome.SUCCESS,
            entityType: 'STATUS_MAPPING',
            entityId: created.id,
            metadata: {
              changedFields,
              previousValues: {},
              newValues: pick(data, changedFields),
            },
            ...requestContext,
          },
          tx,
        );
        return created;
      });
    } catch (error) {
      if (isUniqueError(error)) throw duplicateException();
      throw new InternalServerErrorException(
        'Nie udało się utworzyć mapowania statusu.',
      );
    }
  }

  async update(
    id: string,
    body: unknown,
    actorId?: string,
    requestContext: AuditRequestContext = {},
  ): Promise<StatusMappingItem> {
    if (!isUuid(id)) {
      throw new BadRequestException('Identyfikator mapowania jest nieprawidłowy.');
    }
    const data = parseUpdateBody(body);
    const current = await this.prisma.statusMapping.findUnique({
      where: { id },
      select: selection,
    });
    if (!current) throw new NotFoundException('Nie znaleziono mapowania statusu.');
    if (data.sourceStatus !== undefined) {
      await this.ensureUnique(
        current.sourceEntityType,
        data.sourceStatus,
        current.id,
      );
    }

    try {
      const update = (client: typeof this.prisma) =>
        client.statusMapping.update({ where: { id }, data, select: selection });
      if (!this.auditService || !actorId) return await update(this.prisma);

      return await this.prisma.$transaction(async (tx) => {
        const updated = await update(tx as typeof this.prisma);
        const changedFields = Object.keys(data).filter(
          (field) =>
            current[field as keyof typeof current] !==
            data[field as keyof UpdateData],
        );
        await this.auditService!.record(
          {
            actorId,
            action: 'STATUS_MAPPING_UPDATED',
            outcome: AuditOutcome.SUCCESS,
            entityType: 'STATUS_MAPPING',
            entityId: id,
            metadata: {
              changedFields,
              previousValues: pick(current, changedFields),
              newValues: pick(data, changedFields),
            },
            ...requestContext,
          },
          tx,
        );
        return updated;
      });
    } catch (error) {
      if (isUniqueError(error)) throw duplicateException();
      if (isNotFoundError(error)) {
        throw new NotFoundException('Nie znaleziono mapowania statusu.');
      }
      throw new InternalServerErrorException(
        'Nie udało się zaktualizować mapowania statusu.',
      );
    }
  }

  async resolve(
    sourceEntityType: StatusMappingSourceEntityType,
    sourceStatus: string,
  ): Promise<ResolvedStatusMapping> {
    const normalized = sourceStatus.trim();
    if (!normalized) return { recognized: false };

    const mapping = await this.prisma.statusMapping.findFirst({
      where: {
        sourceEntityType,
        sourceStatus: { equals: normalized, mode: 'insensitive' },
        active: true,
      },
      select: {
        customerStatusCode: true,
        customerLabel: true,
        emailTemplateId: true,
        sendEmail: true,
        isTerminal: true,
        requiresAction: true,
      },
    });
    return mapping ? { recognized: true, ...mapping } : { recognized: false };
  }

  private async ensureUnique(
    sourceEntityType: StatusMappingSourceEntityType,
    sourceStatus: string,
    excludedId?: string,
  ): Promise<void> {
    const duplicate = await this.prisma.statusMapping.findFirst({
      where: {
        sourceEntityType,
        sourceStatus: { equals: sourceStatus.trim(), mode: 'insensitive' },
        ...(excludedId ? { id: { not: excludedId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) throw duplicateException();
  }
}

function parseCreateBody(body: unknown): MappingData {
  const record = requireRecord(body);
  rejectUnknown(record, [
    'sourceEntityType', 'sourceStatus', 'customerStatusCode', 'customerLabel',
    'emailTemplateId', 'sendEmail', 'isTerminal', 'requiresAction', 'active',
  ]);
  return {
    sourceEntityType: requiredEntityType(record.sourceEntityType),
    sourceStatus: requiredText(record.sourceStatus, 'sourceStatus', 200),
    customerStatusCode: statusCode(record.customerStatusCode),
    customerLabel: requiredText(record.customerLabel, 'customerLabel', 200),
    emailTemplateId: nullableText(record.emailTemplateId, 'emailTemplateId', 100),
    sendEmail: optionalBodyBoolean(record, 'sendEmail', false),
    isTerminal: optionalBodyBoolean(record, 'isTerminal', false),
    requiresAction: optionalBodyBoolean(record, 'requiresAction', false),
    active: optionalBodyBoolean(record, 'active', true),
  };
}

function parseUpdateBody(body: unknown): UpdateData {
  const record = requireRecord(body);
  rejectUnknown(record, [
    'sourceStatus', 'customerStatusCode', 'customerLabel', 'emailTemplateId',
    'sendEmail', 'isTerminal', 'requiresAction', 'active',
  ]);
  if (!Object.keys(record).length) {
    throw new BadRequestException('Podaj co najmniej jedno pole do aktualizacji.');
  }
  const data: UpdateData = {};
  if ('sourceStatus' in record) data.sourceStatus = requiredText(record.sourceStatus, 'sourceStatus', 200);
  if ('customerStatusCode' in record) data.customerStatusCode = statusCode(record.customerStatusCode);
  if ('customerLabel' in record) data.customerLabel = requiredText(record.customerLabel, 'customerLabel', 200);
  if ('emailTemplateId' in record) data.emailTemplateId = nullableText(record.emailTemplateId, 'emailTemplateId', 100);
  for (const field of ['sendEmail', 'isTerminal', 'requiresAction', 'active'] as const) {
    if (field in record) data[field] = bodyBoolean(record[field], field);
  }
  return data;
}

function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new BadRequestException(`Pole ${field} jest wymagane.`);
  const normalized = value.trim();
  if (!normalized) throw new BadRequestException(`Pole ${field} jest wymagane.`);
  if (normalized.length > max) throw new BadRequestException(`Pole ${field} może mieć maksymalnie ${max} znaków.`);
  return normalized;
}

function statusCode(value: unknown): string {
  const normalized = requiredText(value, 'customerStatusCode', 100).toUpperCase();
  if (!/^[A-Z0-9_]+$/.test(normalized)) {
    throw new BadRequestException('Pole customerStatusCode może zawierać tylko A-Z, 0-9 i znak podkreślenia.');
  }
  return normalized;
}

function nullableText(value: unknown, field: string, max: number): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new BadRequestException(`Pole ${field} musi być tekstem albo null.`);
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > max) throw new BadRequestException(`Pole ${field} może mieć maksymalnie ${max} znaków.`);
  return normalized;
}

function requiredEntityType(value: unknown): StatusMappingSourceEntityType {
  if (value !== StatusMappingSourceEntityType.REPAIR && value !== StatusMappingSourceEntityType.INSPECTION) {
    throw new BadRequestException('Pole sourceEntityType jest nieprawidłowe.');
  }
  return value;
}

function optionalEntityType(value?: string): StatusMappingSourceEntityType | undefined {
  return value ? requiredEntityType(value) : undefined;
}

function optionalBodyBoolean(record: Record<string, unknown>, field: string, fallback: boolean): boolean {
  return field in record ? bodyBoolean(record[field], field) : fallback;
}

function bodyBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new BadRequestException(`Pole ${field} musi mieć wartość true albo false.`);
  return value;
}

function optionalBoolean(value: string | undefined, field: string): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new BadRequestException(`Parametr ${field} musi mieć wartość true albo false.`);
}

function positiveInteger(value: string | undefined, field: string, fallback: number, max?: number): number {
  if (!value) return fallback;
  if (!/^\d+$/.test(value)) throw new BadRequestException(`Parametr ${field} jest nieprawidłowy.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || (max && parsed > max)) {
    throw new BadRequestException(`Parametr ${field} jest nieprawidłowy.`);
  }
  return parsed;
}

function requireRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Nieprawidłowy format danych wejściowych.');
  }
  return body as Record<string, unknown>;
}

function rejectUnknown(record: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(record).some((field) => !allowed.includes(field))) {
    throw new BadRequestException('Dane zawierają niedozwolone pola.');
  }
}

function pick(source: object, fields: string[]): Record<string, unknown> {
  const record = source as Record<string, unknown>;
  return Object.fromEntries(fields.map((field) => [field, record[field]]));
}

function duplicateException() {
  return new ConflictException('Mapowanie dla tego typu encji i statusu źródłowego już istnieje.');
}

function isUniqueError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2025');
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
