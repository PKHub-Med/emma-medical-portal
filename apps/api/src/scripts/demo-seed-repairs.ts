import 'dotenv/config';
import { PrismaService } from '../prisma/prisma.service';

if (require.main === module) {
  const hospitalId = process.argv
    .slice(2)
    .find((argument) => argument.startsWith('--hospital-id='))
    ?.slice('--hospital-id='.length)
    .replace(/^"|"$/g, '');
  if (!hospitalId || !isUuid(hospitalId)) {
    console.error('Użycie: npm run demo:seed-repairs -- --hospital-id="UUID_SZPITALA"');
    process.exitCode = 1;
  } else {
    void seedRepairs(hospitalId).catch((error) => {
      console.error(error instanceof Error ? error.message : 'Seed nie powiódł się.');
      process.exitCode = 1;
    });
  }
}

export async function seedRepairs(
  selectedHospitalId: string,
  prisma = new PrismaService(),
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

    const now = Date.now();
    const definitions = [
      { code: 'NEW', label: 'Nowa', days: 1 },
      { code: 'ACCEPTED', label: 'Przyjęta', days: 3 },
      { code: 'WAITING_FOR_SERVICE', label: 'Oczekuje na serwis', days: 6 },
      { code: 'IN_PROGRESS', label: 'W trakcie naprawy', days: 9 },
      { code: 'COMPLETED', label: 'Zakończona', days: 14 },
      { code: 'IN_PROGRESS', label: 'W trakcie naprawy', days: 20 },
    ];

    for (const [index, definition] of definitions.entries()) {
      const businessNumber = `EMMA-DEMO-${selectedHospitalId.slice(0, 8)}-${String(index + 1).padStart(2, '0')}`.trim();
      const existing = await prisma.repair.findUnique({
        where: { businessNumber },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      const reportedAt = new Date(now - definition.days * 86_400_000);
      const isTerminal = definition.code === 'COMPLETED';
      const repair = await prisma.repair.create({
        data: {
          deviceId: devices[index % devices.length].id,
          businessNumber,
          customerStatusCode: definition.code,
          customerLabel: definition.label,
          isTerminal,
          reportedAt,
          acceptedAt: index > 0 ? new Date(reportedAt.getTime() + 3_600_000) : null,
          startedAt: ['IN_PROGRESS', 'COMPLETED'].includes(definition.code)
            ? new Date(reportedAt.getTime() + 86_400_000)
            : null,
          completedAt: isTerminal ? new Date(reportedAt.getTime() + 3 * 86_400_000) : null,
          customerDescription: `Przykładowa naprawa ${businessNumber}.`,
        },
        select: { id: true },
      });
      const history = historyFor(definition.code, definition.label, reportedAt);
      await prisma.statusHistory.createMany({
        data: history.map((entry, historyIndex) => ({
          entityType: 'REPAIR',
          entityId: repair.id,
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
    console.log(`Naprawy — utworzone: ${created}, pominięte: ${skipped}.`);
    console.log(`Historia statusów — utworzone wpisy: ${historyCreated}.`);
    return { created, skipped, historyCreated };
  } finally {
    await prisma.$disconnect();
  }
}

function historyFor(code: string, label: string, reportedAt: Date) {
  const all = [
    { code: 'NEW', label: 'Nowa' },
    { code: 'ACCEPTED', label: 'Przyjęta' },
    { code: 'WAITING_FOR_SERVICE', label: 'Oczekuje na serwis' },
    { code: 'IN_PROGRESS', label: 'W trakcie naprawy' },
    { code: 'COMPLETED', label: 'Zakończona' },
  ];
  const target = all.findIndex((item) => item.code === code);
  const count = Math.min(3, Math.max(1, target + 1));
  const start = Math.max(0, target - count + 1);
  return all.slice(start, target + 1).map((item, index) => ({
    ...item,
    changedAt: new Date(reportedAt.getTime() + index * 86_400_000),
  }));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
