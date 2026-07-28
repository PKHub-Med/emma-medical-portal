import 'dotenv/config';
import { StatusMappingSourceEntityType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

const definitions = [
  [StatusMappingSourceEntityType.REPAIR, 'NEW', 'NEW', 'Nowa', false],
  [StatusMappingSourceEntityType.REPAIR, 'ACCEPTED', 'ACCEPTED', 'Przyjęta', false],
  [StatusMappingSourceEntityType.REPAIR, 'IN_PROGRESS', 'IN_PROGRESS', 'W trakcie naprawy', false],
  [StatusMappingSourceEntityType.REPAIR, 'COMPLETED', 'COMPLETED', 'Zakończona', true],
  [StatusMappingSourceEntityType.INSPECTION, 'PLANNED', 'PLANNED', 'Zaplanowany', false],
  [StatusMappingSourceEntityType.INSPECTION, 'IN_PROGRESS', 'IN_PROGRESS', 'W trakcie przeglądu', false],
  [StatusMappingSourceEntityType.INSPECTION, 'COMPLETED', 'COMPLETED', 'Zakończony', true],
  [StatusMappingSourceEntityType.INSPECTION, 'CANCELLED', 'CANCELLED', 'Anulowany', true],
] as const;

if (require.main === module) {
  void seedStatusMappings().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Seed nie powiódł się.');
    process.exitCode = 1;
  });
}

export async function seedStatusMappings(
  prisma = new PrismaService(),
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  try {
    for (const [
      sourceEntityType,
      sourceStatus,
      customerStatusCode,
      customerLabel,
      isTerminal,
    ] of definitions) {
      const existing = await prisma.statusMapping.findFirst({
        where: {
          sourceEntityType,
          sourceStatus: { equals: sourceStatus, mode: 'insensitive' },
        },
        select: { id: true },
      });
      const data = {
        sourceEntityType,
        sourceStatus,
        customerStatusCode,
        customerLabel,
        emailTemplateId: null,
        sendEmail: false,
        isTerminal,
        requiresAction: false,
        active: true,
      };
      if (existing) {
        await prisma.statusMapping.update({ where: { id: existing.id }, data });
        updated += 1;
      } else {
        await prisma.statusMapping.create({ data });
        created += 1;
      }
    }
    console.log(`Mapowania statusów — utworzone: ${created}, zaktualizowane: ${updated}.`);
    return { created, updated };
  } finally {
    await prisma.$disconnect();
  }
}
