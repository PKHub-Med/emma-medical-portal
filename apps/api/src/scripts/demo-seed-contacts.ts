import 'dotenv/config';
import { PrismaService } from '../prisma/prisma.service';

const hospitalId = process.argv
  .slice(2)
  .find((argument) => argument.startsWith('--hospital-id='))
  ?.slice('--hospital-id='.length)
  .replace(/^"|"$/g, '');

if (
  !hospitalId ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    hospitalId,
  )
) {
  console.error(
    'Użycie: npm run demo:seed-contacts -- --hospital-id="UUID_SZPITALA"',
  );
  process.exitCode = 1;
} else {
  void seed(hospitalId);
}

async function seed(selectedHospitalId: string): Promise<void> {
  const prisma = new PrismaService();
  let created = 0;
  let skipped = 0;
  const contacts = [
    {
      name: 'Anna Kowalska',
      email: 'anna.kowalska@example-hospital.pl',
      jobTitle: 'Dział aparatury medycznej',
    },
    {
      name: 'Piotr Nowak',
      email: 'piotr.nowak@example-hospital.pl',
      jobTitle: 'Kierownik techniczny',
    },
    {
      name: 'Marta Wiśniewska',
      email: 'marta.wisniewska@example-hospital.pl',
      jobTitle: 'Administracja',
    },
  ];
  try {
    const hospital = await prisma.hospital.findUnique({
      where: { id: selectedHospitalId },
      select: { id: true, name: true },
    });
    if (!hospital) {
      throw new Error(`Nie znaleziono szpitala ${selectedHospitalId}.`);
    }
    for (const contact of contacts) {
      const existing = await prisma.contact.findUnique({
        where: {
          hospitalId_email: {
            hospitalId: selectedHospitalId,
            email: contact.email,
          },
        },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
      } else {
        await prisma.contact.create({
          data: {
            hospitalId: selectedHospitalId,
            ...contact,
            active: true,
            linkedUserId: null,
          },
        });
        created += 1;
      }
    }
    await prisma.communicationSettings.upsert({
      where: { hospitalId: selectedHospitalId },
      create: { hospitalId: selectedHospitalId, enabled: false },
      update: {},
    });
    console.log(`Szpital: ${hospital.name} (${hospital.id})`);
    console.log(`Kontakty — utworzone: ${created}, pominięte: ${skipped}.`);
    console.log('Komunikacja pozostaje wyłączona.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Seed nie powiódł się.');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
