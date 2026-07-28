import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import {
  AuditOutcome,
  EmailDeliveryStatus,
  NotificationEntityType,
  NotificationEventStatus,
  NotificationEventType,
} from '../generated/prisma/enums';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationEventProcessor } from './notification-event.processor';
import type {
  AdminEmailsQuery,
  CreateStatusChangedEventInput,
  NotificationEventListItem,
  NotificationPayload,
} from './notifications.types';

@Injectable()
export class NotificationEventService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly processor: NotificationEventProcessor,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async createStatusChangedEvent(input: CreateStatusChangedEventInput) {
    validateCreateInput(input);
    const prefix = input.entityType === NotificationEntityType.REPAIR ? 'repair' : 'inspection';
    const eventKey = `${prefix}:${input.entityId}:status:${input.customerStatusCode}:${input.version}`;
    const existing = await this.prisma.notificationEvent.findUnique({
      where: { eventKey },
      include: { deliveries: true },
    });
    if (existing) return existing;

    const entity = input.entityType === NotificationEntityType.REPAIR
      ? await this.prisma.repair.findUnique({
          where: { id: input.entityId },
          include: { device: { include: { hospital: true } } },
        })
      : await this.prisma.inspection.findUnique({
          where: { id: input.entityId },
          include: { device: { include: { hospital: true } } },
        });
    if (!entity?.device?.hospital) {
      throw new NotFoundException('Nie znaleziono sprawy w istniejącym szpitalu.');
    }
    const mapping = await this.prisma.statusMapping.findFirst({
      where: {
        sourceEntityType: input.entityType,
        customerStatusCode: input.customerStatusCode,
        active: true,
      },
      select: { emailTemplateId: true },
    });
    if (!mapping) throw new BadRequestException('Status jest nieznany lub nieaktywny.');

    const payload: NotificationPayload = {
      businessNumber: entity.businessNumber,
      customerStatusCode: input.customerStatusCode,
      customerLabel: input.customerLabel,
      deviceId: entity.device.id,
      deviceName: entity.device.name,
      serialNo: entity.device.serialNo,
      inventoryNo: entity.device.inventoryNo,
      occurredAt: input.occurredAt.toISOString(),
    };
    let created;
    try {
      created = await this.prisma.notificationEvent.create({
        data: {
          eventKey,
          hospitalId: entity.device.hospital.id,
          entityType: input.entityType,
          entityId: input.entityId,
          eventType: NotificationEventType.STATUS_CHANGED,
          customerStatusCode: input.customerStatusCode,
          customerLabel: input.customerLabel,
          emailTemplateId: mapping.emailTemplateId?.trim() || null,
          status: NotificationEventStatus.PENDING,
          payload: payload as unknown as Prisma.InputJsonValue,
          occurredAt: input.occurredAt,
        },
      });
    } catch (error) {
      if (isUniqueError(error)) {
        return this.prisma.notificationEvent.findUniqueOrThrow({
          where: { eventKey },
          include: { deliveries: true },
        });
      }
      throw error;
    }
    await this.audit?.record({
      action: 'NOTIFICATION_EVENT_CREATED',
      outcome: AuditOutcome.SUCCESS,
      entityType: 'NOTIFICATION_EVENT',
      entityId: created.id,
      hospitalId: created.hospitalId,
      metadata: {
        eventId: created.id,
        hospitalId: created.hospitalId,
        entityType: created.entityType,
        entityId: created.entityId,
      },
    });
    return this.processor.process(created.id);
  }

  async list(query: AdminEmailsQuery) {
    const page = positiveInteger(query.page, 1);
    const pageSize = positiveInteger(query.pageSize, 25, 100);
    const search = query.search?.trim();
    const dateFrom = optionalDate(query.dateFrom);
    const dateTo = optionalDate(query.dateTo);
    if (dateFrom && dateTo && dateFrom > dateTo) throw new BadRequestException('Nieprawidłowy zakres dat.');
    const deliveryFilters: Prisma.EmailDeliveryWhereInput = {
      ...(query.deliveryStatus
        ? { status: enumValue(EmailDeliveryStatus, query.deliveryStatus, 'deliveryStatus') }
        : {}),
      ...(query.recipient
        ? { recipientEmail: { contains: query.recipient.trim(), mode: 'insensitive' } }
        : {}),
    };
    const hasDeliveryFilters = Object.keys(deliveryFilters).length > 0;
    const where: Prisma.NotificationEventWhereInput = {
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.entityType
        ? { entityType: enumValue(NotificationEntityType, query.entityType, 'entityType') }
        : {}),
      ...(query.eventStatus
        ? { status: enumValue(NotificationEventStatus, query.eventStatus, 'eventStatus') }
        : {}),
      ...(hasDeliveryFilters ? { deliveries: { some: deliveryFilters } } : {}),
      ...(dateFrom || dateTo
        ? { occurredAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
        : {}),
      ...(search ? {
        OR: [
          { eventKey: { contains: search, mode: 'insensitive' } },
          { customerLabel: { contains: search, mode: 'insensitive' } },
          { payload: { path: ['businessNumber'], string_contains: search } },
          { deliveries: { some: { recipientEmail: { contains: search, mode: 'insensitive' } } } },
        ],
      } : {}),
    };
    const [events, totalCount] = await this.prisma.$transaction([
      this.prisma.notificationEvent.findMany({
        where,
        include: {
          hospital: { select: { id: true, name: true } },
          deliveries: {
            select: {
              id: true,
              recipientEmail: true,
              recipientName: true,
              status: true,
              attempts: true,
              providerId: true,
              lastErrorMessage: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notificationEvent.count({ where }),
    ]);
    const items: NotificationEventListItem[] = events.map((event) => ({
      ...event,
      businessNumber: safePayload(event.payload).businessNumber,
      eventType: 'STATUS_CHANGED',
    }));
    return { items, page, pageSize, totalCount };
  }

  async get(eventId: string) {
    const event = await this.prisma.notificationEvent.findUnique({
      where: { id: eventId },
      include: {
        hospital: { select: { id: true, name: true, active: true } },
        deliveries: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!event) throw new NotFoundException('Nie znaleziono zdarzenia komunikacyjnego.');
    const settings = await this.prisma.communicationSettings.findUnique({
      where: { hospitalId: event.hospitalId },
      select: {
        enabled: true,
        primaryContactId: true,
        recipients: { select: { contactId: true } },
      },
    });
    return {
      ...event,
      payload: safePayload(event.payload),
      businessNumber: safePayload(event.payload).businessNumber,
      communicationSettings: settings ? {
        enabled: settings.enabled,
        primaryContactId: settings.primaryContactId,
        additionalRecipientCount: settings.recipients.length,
        emailTemplateId: event.emailTemplateId,
      } : null,
    };
  }

  async reprocess(eventId: string, actorId?: string) {
    await this.processor.reprocess(eventId, actorId);
    return this.get(eventId);
  }
}

export function safePayload(value: unknown): NotificationPayload {
  const input = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    businessNumber: String(input.businessNumber ?? ''),
    customerStatusCode: String(input.customerStatusCode ?? ''),
    customerLabel: String(input.customerLabel ?? ''),
    deviceId: String(input.deviceId ?? ''),
    deviceName: String(input.deviceName ?? ''),
    serialNo: typeof input.serialNo === 'string' ? input.serialNo : null,
    inventoryNo: typeof input.inventoryNo === 'string' ? input.inventoryNo : null,
    occurredAt: String(input.occurredAt ?? ''),
  };
}

function validateCreateInput(input: CreateStatusChangedEventInput) {
  if (!Object.values(NotificationEntityType).includes(input.entityType)) throw new BadRequestException('Nieprawidłowy typ sprawy.');
  if (!input.entityId || !input.customerStatusCode.trim() || !input.version.trim()) throw new BadRequestException('Brak wymaganych danych zdarzenia.');
  if (!(input.occurredAt instanceof Date) || Number.isNaN(input.occurredAt.getTime())) throw new BadRequestException('Nieprawidłowa data zdarzenia.');
}
function positiveInteger(value: string | undefined, fallback: number, max?: number) {
  if (!value) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || (max && number > max)) throw new BadRequestException('Nieprawidłowy parametr stronicowania.');
  return number;
}
function optionalDate(value?: string) {
  if (!value) return undefined;
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) throw new BadRequestException('Nieprawidłowa data.');
  return result;
}
function enumValue<T extends Record<string, string>>(values: T, value: string, field: string): T[keyof T] {
  if (!Object.values(values).includes(value)) throw new BadRequestException(`Nieprawidłowy parametr ${field}.`);
  return value as T[keyof T];
}
function isUniqueError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}
