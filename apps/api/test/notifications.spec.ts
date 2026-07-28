import { ForbiddenException } from '@nestjs/common';
import { EmmaAdminGuard } from '../src/admin-hospitals/emma-admin.guard';
import { NotificationEntityType, NotificationEventStatus } from '../src/generated/prisma/enums';
import { NotificationEventProcessor } from '../src/notifications/notification-event.processor';
import { NotificationEventService, safePayload } from '../src/notifications/notification-event.service';
import { NotificationRecipientResolver } from '../src/notifications/notification-recipient.resolver';
import { PrismaService } from '../src/prisma/prisma.service';

const hospitalId = '40ca8d91-ce93-45bf-a164-498cc08f00b1';
const eventId = '213b2b38-a14e-4aa5-b539-8c03ac9a92dd';
const entityId = '80cbf4bf-9f17-4fde-8296-9a3558e8df38';
const contact = {
  id: '41282b48-b5b1-41a2-b04a-76365dbb71c0', hospitalId,
  name: 'Anna', email: ' Anna@Example.PL ', active: true, sourceDeletedAt: null,
};

describe('Notification outbox', () => {
  it('deduplicates normalized recipients and excludes inactive/foreign contacts', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      enabled: true,
      primaryContact: contact,
      recipients: [
        { contact: { ...contact, id: 'duplicate', email: 'anna@example.pl' } },
        { contact: { ...contact, id: 'inactive', email: 'inactive@example.pl', active: false } },
        { contact: { ...contact, id: 'foreign', email: 'foreign@example.pl', hospitalId: entityId } },
        { contact: { ...contact, id: 'invalid', email: 'invalid' } },
      ],
    });
    const resolver = new NotificationRecipientResolver({
      communicationSettings: { findUnique },
    } as unknown as PrismaService);
    await expect(resolver.resolve(hospitalId)).resolves.toEqual([{
      contactId: contact.id, email: 'anna@example.pl', name: 'Anna',
    }]);
  });

  it.each([
    ['communication disabled', { settings: { enabled: false }, mapping: null, recipients: [] }, 'COMMUNICATION_DISABLED'],
    ['sendEmail=false', { settings: { enabled: true }, mapping: { sendEmail: false, emailTemplateId: 'tpl' }, recipients: [] }, 'EMAIL_DISABLED_FOR_STATUS'],
    ['missing template', { settings: { enabled: true }, mapping: { sendEmail: true, emailTemplateId: null }, recipients: [] }, 'EMAIL_TEMPLATE_MISSING'],
    ['no active contact', { settings: { enabled: true }, mapping: { sendEmail: true, emailTemplateId: 'tpl' }, recipients: [] }, 'NO_ACTIVE_RECIPIENT'],
  ])('blocks when %s', async (_label, setup, code) => {
    const { processor, update } = processorFixture(setup);
    await processor.process(eventId);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: NotificationEventStatus.BLOCKED,
        blockedReasonCode: code,
      }),
    }));
  });

  it('marks a valid event READY and creates QUEUED deliveries', async () => {
    const { processor, createMany, update } = processorFixture({
      settings: { enabled: true },
      mapping: { sendEmail: true, emailTemplateId: ' tpl ' },
      recipients: [{ contactId: contact.id, email: 'anna@example.pl', name: 'Anna' }],
    });
    await processor.process(eventId);
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ recipientEmail: 'anna@example.pl' })],
      skipDuplicates: true,
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: NotificationEventStatus.READY, emailTemplateId: 'tpl' }),
    }));
  });

  it('reprocess removes only never-sent deliveries and relies on unique inserts', async () => {
    const fixture = processorFixture({
      settings: { enabled: true },
      mapping: { sendEmail: true, emailTemplateId: 'tpl' },
      recipients: [{ contactId: contact.id, email: 'anna@example.pl', name: 'Anna' }],
    });
    fixture.findEvent
      .mockResolvedValueOnce({ id: eventId, hospitalId, entityType: 'REPAIR', entityId })
      .mockResolvedValueOnce(baseEvent);
    await fixture.processor.reprocess(eventId);
    expect(fixture.deleteMany).toHaveBeenCalledWith({
      where: {
        notificationEventId: eventId,
        sentAt: null,
        status: { in: ['QUEUED', 'SKIPPED', 'FAILED'] },
      },
    });
    expect(fixture.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  });

  it('returns an existing event for the same eventKey without processing again', async () => {
    const existing = { id: eventId, deliveries: [] };
    const findUnique = jest.fn().mockResolvedValue(existing);
    const process = jest.fn();
    const service = new NotificationEventService({
      notificationEvent: { findUnique },
    } as unknown as PrismaService, { process } as unknown as NotificationEventProcessor);
    await expect(service.createStatusChangedEvent(input())).resolves.toBe(existing);
    expect(process).not.toHaveBeenCalled();
  });

  it('creates a safe payload without integration fields and queues processing', async () => {
    const create = jest.fn().mockImplementation(({ data }) => ({ id: eventId, ...data }));
    const process = jest.fn().mockResolvedValue({ id: eventId });
    const prisma = {
      notificationEvent: { findUnique: jest.fn().mockResolvedValue(null), create },
      repair: { findUnique: jest.fn().mockResolvedValue({
        businessNumber: 'N-1',
        sourceStatus: 'SECRET',
        device: { id: entityId, name: 'USG', serialNo: 'S1', inventoryNo: null, hospital: { id: hospitalId } },
      }) },
      statusMapping: { findFirst: jest.fn().mockResolvedValue({ emailTemplateId: 'tpl' }) },
    };
    const service = new NotificationEventService(prisma as unknown as PrismaService, { process } as unknown as NotificationEventProcessor);
    await service.createStatusChangedEvent(input());
    const payload = create.mock.calls[0][0].data.payload;
    expect(payload).toEqual(expect.objectContaining({ businessNumber: 'N-1', deviceName: 'USG' }));
    expect(payload).not.toHaveProperty('sourceStatus');
    expect(payload).not.toHaveProperty('Uwagi');
    expect(process).toHaveBeenCalledWith(eventId);
  });

  it('safePayload strips unexpected technical data', () => {
    expect(safePayload({ businessNumber: 'N-1', sourceStatus: 'raw', Uwagi: 'secret' }))
      .toEqual(expect.not.objectContaining({ sourceStatus: expect.anything(), Uwagi: expect.anything() }));
  });

  it('allows EMMA_ADMIN and denies USER access', () => {
    const guard = new EmmaAdminGuard();
    expect(guard.canActivate(context('EMMA_ADMIN'))).toBe(true);
    expect(() => guard.canActivate(context('USER'))).toThrow(ForbiddenException);
  });
});

const baseEvent = {
  id: eventId, hospitalId, entityType: 'REPAIR', entityId,
  customerStatusCode: 'COMPLETED', hospital: { id: hospitalId, active: true },
};

function processorFixture(setup: {
  settings: { enabled: boolean };
  mapping: { sendEmail: boolean; emailTemplateId: string | null } | null;
  recipients: Array<{ contactId: string; email: string; name: string | null }>;
}) {
  const findEvent = jest.fn().mockResolvedValue(baseEvent);
  const update = jest.fn().mockImplementation(({ data }) => ({ ...baseEvent, ...data, deliveries: [] }));
  const createMany = jest.fn().mockResolvedValue({ count: setup.recipients.length });
  const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const tx = { notificationEvent: { update }, emailDelivery: { createMany } };
  const prisma = {
    notificationEvent: { findUnique: findEvent, update },
    communicationSettings: { findUnique: jest.fn().mockResolvedValue(setup.settings) },
    statusMapping: { findFirst: jest.fn().mockResolvedValue(setup.mapping) },
    emailDelivery: { deleteMany },
    $transaction: jest.fn((callback) => callback(tx)),
  };
  const resolver = { resolve: jest.fn().mockResolvedValue(setup.recipients) };
  return {
    processor: new NotificationEventProcessor(prisma as unknown as PrismaService, resolver as unknown as NotificationRecipientResolver),
    findEvent, update, createMany, deleteMany,
  };
}

function input() {
  return {
    entityType: NotificationEntityType.REPAIR,
    entityId,
    customerStatusCode: 'COMPLETED',
    customerLabel: 'Zakończona',
    version: 'v1',
    occurredAt: new Date('2026-07-28T12:00:00Z'),
  };
}

function context(systemRole: string) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ currentUser: { systemRole } }) }),
  } as never;
}
