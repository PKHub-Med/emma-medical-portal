import 'dotenv/config';
import { NotificationEntityType } from '../generated/prisma/enums';
import { NotificationEventProcessor } from '../notifications/notification-event.processor';
import { NotificationEventService } from '../notifications/notification-event.service';
import { NotificationRecipientResolver } from '../notifications/notification-recipient.resolver';
import { PrismaService } from '../prisma/prisma.service';

if (require.main === module) {
  void seedNotificationEvents().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Seed nie powiódł się.');
    process.exitCode = 1;
  });
}

export async function seedNotificationEvents(prisma = new PrismaService()) {
  const hospitalId = argument('hospital-id');
  if (!hospitalId) throw new Error('Użycie: --hospital-id="UUID_SZPITALA"');
  const hospital = await prisma.hospital.findUnique({ where: { id: hospitalId }, select: { id: true } });
  if (!hospital) throw new Error('Nie znaleziono szpitala.');

  const [repairs, inspections, deliveriesBefore] = await Promise.all([
    prisma.repair.findMany({
      where: { device: { hospitalId } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { id: true, updatedAt: true, sourceUpdatedAt: true },
    }),
    prisma.inspection.findMany({
      where: { device: { hospitalId } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { id: true, updatedAt: true, sourceUpdatedAt: true },
    }),
    prisma.emailDelivery.count({ where: { notificationEvent: { hospitalId } } }),
  ]);
  const resolver = new NotificationRecipientResolver(prisma);
  const processor = new NotificationEventProcessor(prisma, resolver);
  const service = new NotificationEventService(prisma, processor);
  const definitions = [
    [NotificationEntityType.REPAIR, repairs[0], 'COMPLETED'],
    [NotificationEntityType.REPAIR, repairs[1] ?? repairs[0], 'IN_PROGRESS'],
    [NotificationEntityType.INSPECTION, inspections[0], 'COMPLETED'],
    [NotificationEntityType.INSPECTION, inspections[1] ?? inspections[0], 'PLANNED'],
  ] as const;
  let created = 0;
  let existing = 0;
  const processedIds: string[] = [];

  try {
    for (const [entityType, entity, statusCode] of definitions) {
      if (!entity) continue;
      const mapping = await prisma.statusMapping.findFirst({
        where: { sourceEntityType: entityType, customerStatusCode: statusCode, active: true },
        select: { customerStatusCode: true, customerLabel: true },
      });
      if (!mapping) continue;
      const history = await prisma.statusHistory.findFirst({
        where: { entityType, entityId: entity.id, newStatusCode: statusCode },
        orderBy: { changedAt: 'desc' },
        select: { changedAt: true },
      });
      const occurredAt = entity.sourceUpdatedAt ?? history?.changedAt ?? entity.updatedAt;
      const version = `demo-${statusCode.toLowerCase()}-v1`;
      const prefix = entityType === NotificationEntityType.REPAIR ? 'repair' : 'inspection';
      const eventKey = `${prefix}:${entity.id}:status:${statusCode}:${version}`;
      const wasExisting = await prisma.notificationEvent.findUnique({ where: { eventKey }, select: { id: true } });
      const event = await service.createStatusChangedEvent({
        entityType,
        entityId: entity.id,
        customerStatusCode: mapping.customerStatusCode,
        customerLabel: mapping.customerLabel,
        version,
        occurredAt,
      });
      wasExisting ? existing += 1 : created += 1;
      processedIds.push(event.id);
    }
    const [ready, blocked, deliveriesAfter] = await Promise.all([
      prisma.notificationEvent.count({ where: { id: { in: processedIds }, status: 'READY' } }),
      prisma.notificationEvent.count({ where: { id: { in: processedIds }, status: 'BLOCKED' } }),
      prisma.emailDelivery.count({ where: { notificationEvent: { hospitalId } } }),
    ]);
    const result = {
      created,
      existing,
      ready,
      blocked,
      emailDeliveriesCreated: deliveriesAfter - deliveriesBefore,
    };
    console.log(
      `Zdarzenia — utworzone: ${created}, istniejące: ${existing}, READY: ${ready}, BLOCKED: ${blocked}, EmailDelivery: ${result.emailDeliveriesCreated}.`,
    );
    return result;
  } finally {
    await prisma.$disconnect();
  }
}

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length).replace(/^["']|["']$/g, '');
}
