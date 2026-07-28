import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { AuditOutcome, NotificationEventStatus } from '../generated/prisma/enums';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationRecipientResolver } from './notification-recipient.resolver';

export const notificationBlockedReasons = {
  COMMUNICATION_DISABLED: 'Komunikacja dla szpitala jest wyłączona.',
  NO_ACTIVE_RECIPIENT: 'Nie znaleziono aktywnego odbiorcy.',
  EMAIL_DISABLED_FOR_STATUS: 'Dla tego statusu wysyłka e-mail jest wyłączona.',
  EMAIL_TEMPLATE_MISSING: 'Nie wskazano szablonu wiadomości.',
} as const;

@Injectable()
export class NotificationEventProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recipients: NotificationRecipientResolver,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async process(eventId: string) {
    const event = await this.prisma.notificationEvent.findUnique({
      where: { id: eventId },
      include: { hospital: { select: { id: true, active: true } } },
    });
    if (!event) throw new NotFoundException('Nie znaleziono zdarzenia komunikacyjnego.');

    const settings = await this.prisma.communicationSettings.findUnique({
      where: { hospitalId: event.hospitalId },
      select: { enabled: true },
    });
    if (!event.hospital.active || !settings?.enabled) {
      return this.block(event, 'COMMUNICATION_DISABLED');
    }
    const mapping = await this.prisma.statusMapping.findFirst({
      where: {
        sourceEntityType: event.entityType,
        customerStatusCode: event.customerStatusCode,
        active: true,
      },
      select: { sendEmail: true, emailTemplateId: true },
    });
    if (!mapping?.sendEmail) return this.block(event, 'EMAIL_DISABLED_FOR_STATUS');
    const emailTemplateId = mapping.emailTemplateId?.trim() || null;
    if (!emailTemplateId) return this.block(event, 'EMAIL_TEMPLATE_MISSING');

    const recipients = await this.recipients.resolve(event.hospitalId);
    if (!recipients.length) return this.block(event, 'NO_ACTIVE_RECIPIENT');

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.emailDelivery.createMany({
        data: recipients.map((recipient) => ({
          notificationEventId: event.id,
          contactId: recipient.contactId,
          recipientEmail: recipient.email,
          recipientName: recipient.name,
        })),
        skipDuplicates: true,
      });
      return tx.notificationEvent.update({
        where: { id: event.id },
        data: {
          status: NotificationEventStatus.READY,
          emailTemplateId,
          blockedReasonCode: null,
          blockedReasonMessage: null,
          processedAt: new Date(),
        },
        include: { deliveries: true },
      });
    });
    await this.recordAudit(event, 'EMAIL_DELIVERY_QUEUED', {
      recipientCount: recipients.length,
    });
    return result;
  }

  async reprocess(eventId: string, actorId?: string) {
    const event = await this.prisma.notificationEvent.findUnique({
      where: { id: eventId },
      select: { id: true, hospitalId: true, entityType: true, entityId: true },
    });
    if (!event) throw new NotFoundException('Nie znaleziono zdarzenia komunikacyjnego.');
    await this.prisma.emailDelivery.deleteMany({
      where: {
        notificationEventId: eventId,
        sentAt: null,
        status: { in: ['QUEUED', 'SKIPPED', 'FAILED'] },
      },
    });
    const result = await this.process(eventId);
    await this.recordAudit(event, 'NOTIFICATION_EVENT_REPROCESSED', {}, actorId);
    return result;
  }

  private async block(
    event: { id: string; hospitalId: string; entityType: string; entityId: string },
    code: keyof typeof notificationBlockedReasons,
  ) {
    const result = await this.prisma.notificationEvent.update({
      where: { id: event.id },
      data: {
        status: NotificationEventStatus.BLOCKED,
        blockedReasonCode: code,
        blockedReasonMessage: notificationBlockedReasons[code],
        processedAt: new Date(),
      },
      include: { deliveries: true },
    });
    await this.recordAudit(event, 'NOTIFICATION_EVENT_BLOCKED', {
      blockedReasonCode: code,
    });
    return result;
  }

  private recordAudit(
    event: { id: string; hospitalId: string; entityType: string; entityId: string },
    action: string,
    metadata: Record<string, unknown>,
    actorId?: string,
  ) {
    return this.audit?.record({
      actorId,
      action,
      outcome: AuditOutcome.SUCCESS,
      entityType: 'NOTIFICATION_EVENT',
      entityId: event.id,
      hospitalId: event.hospitalId,
      metadata: {
        eventId: event.id,
        hospitalId: event.hospitalId,
        entityType: event.entityType,
        entityId: event.entityId,
        ...metadata,
      },
    });
  }
}
