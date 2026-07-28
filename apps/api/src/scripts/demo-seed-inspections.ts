import 'dotenv/config';
import { inspectionDayBoundaries } from '../inspections/inspection-dates';
import { PrismaService } from '../prisma/prisma.service';

if (require.main === module) {
  const hospitalId = process.argv
    .slice(2)
    .find((argument) => argument.startsWith('--hospital-id='))
    ?.slice('--hospital-id='.length)
    .replace(/^"|"$/g, '');
  if (!hospitalId || !isUuid(hospitalId)) {
    console.error('Użycie: npm run demo:seed-inspections -- --hospital-id="UUID_SZPITALA"');
    process.exitCode = 1;
  } else {
    void seedInspections(hospitalId).catch((error) => {
      console.error(error instanceof Error ? error.message : 'Seed nie powiódł się.');
      process.exitCode = 1;
    });
  }
}

export async function seedInspections(
  selectedHospitalId: string,
  prisma = new PrismaService(),
  now = new Date(),
): Promise<{ created: number; skipped: number; historyCreated: number }> {
  let created = 0;
  let skipped = 0;
  let historyCreated = 0;
  try {
    const hospital = await prisma.hospital.findUnique({
      where: { id: selectedHospitalId },
      select: { id: true, name: true },
    });
    if (!hospital) throw new Error(`Nie znaleziono szpitala ${selectedHospitalId}.`);
    const devices = await prisma.device.findMany({
      where: { hospitalId: selectedHospitalId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (devices.length === 0) {
      throw new Error('Szpital musi mieć co najmniej jedno urządzenie.');
    }

    const { startToday } = inspectionDayBoundaries(now);
    const definitions = [
      { code: 'PLANNED', label: 'Zaplanowany', dueDays: -10 },
      { code: 'CONFIRMED', label: 'Termin potwierdzony', dueDays: -2 },
      { code: 'PLANNED', label: 'Zaplanowany', dueDays: 1 },
      { code: 'CONFIRMED', label: 'Termin potwierdzony', dueDays: 7 },
      { code: 'IN_PROGRESS', label: 'W trakcie przeglądu', dueDays: 29 },
      { code: 'PLANNED', label: 'Zaplanowany', dueDays: 45 },
      { code: 'COMPLETED', label: 'Zakończony', dueDays: -20, result: 'Pozytywny' },
      { code: 'CANCELLED', label: 'Anulowany', dueDays: -5, result: 'Wymaga działań' },
    ] as const;

    for (const [index, definition] of definitions.entries()) {
      const businessNumber =
        `P-DEMO-${selectedHospitalId.slice(0, 8)}-${String(index + 1).padStart(2, '0')}`.trim();
      const existing = await prisma.inspection.findUnique({
        where: { businessNumber },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      const dueAt = addDays(startToday, definition.dueDays, 12);
      const plannedAt = addDays(dueAt, -7);
      const isTerminal = ['COMPLETED', 'CANCELLED'].includes(definition.code);
      const performedAt = isTerminal ? addDays(dueAt, -1) : null;
      const inspection = await prisma.inspection.create({
        data: {
          deviceId: devices[index % devices.length].id,
          businessNumber,
          customerStatusCode: definition.code,
          customerLabel: definition.label,
          result: 'result' in definition ? definition.result : null,
          isTerminal,
          plannedAt,
          performedAt,
          dueAt,
          completedAt: isTerminal ? performedAt : null,
          customerDescription: `Przykładowy przegląd ${businessNumber}.`,
        },
        select: { id: true },
      });
      const history = historyFor(
        definition.code,
        definition.label,
        plannedAt,
        index,
      );
      await prisma.statusHistory.createMany({
        data: history.map((entry, historyIndex) => ({
          entityType: 'INSPECTION',
          entityId: inspection.id,
          oldStatusCode: historyIndex ? history[historyIndex - 1].code : null,
          oldLabel: historyIndex ? history[historyIndex - 1].label : null,
          newStatusCode: entry.code,
          newLabel: entry.label,
          changedAt: entry.changedAt,
        })),
      });
      created += 1;
      historyCreated += history.length;
    }
    console.log(`Szpital: ${hospital.name} (${hospital.id})`);
    console.log(`Przeglądy — utworzone: ${created}, pominięte: ${skipped}.`);
    console.log(`Historia statusów — utworzone wpisy: ${historyCreated}.`);
    return { created, skipped, historyCreated };
  } finally {
    await prisma.$disconnect();
  }
}

function historyFor(code: string, label: string, start: Date, index: number) {
  const initial = { code: 'PLANNED', label: 'Zaplanowany' };
  const middle = code === 'CANCELLED'
    ? { code: 'CONFIRMED', label: 'Termin potwierdzony' }
    : { code: 'IN_PROGRESS', label: 'W trakcie przeglądu' };
  const candidates = code === 'PLANNED'
    ? [initial]
    : code === 'CONFIRMED'
      ? [initial, { code, label }]
      : [initial, middle, { code, label }];
  const count = Math.min(candidates.length, (index % 3) + 1);
  return candidates.slice(candidates.length - count).map((item, offset) => ({
    ...item,
    changedAt: addDays(start, offset),
  }));
}

function addDays(date: Date, days: number, hours = 0) {
  return new Date(date.getTime() + (days * 24 + hours) * 60 * 60 * 1000);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
