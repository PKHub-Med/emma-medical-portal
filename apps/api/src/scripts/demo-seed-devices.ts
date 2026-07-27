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
    'Użycie: npm run demo:seed-devices -- --hospital-id="UUID_SZPITALA"',
  );
  process.exitCode = 1;
} else {
  void seed(hospitalId);
}

async function seed(selectedHospitalId: string): Promise<void> {
  const prisma = new PrismaService();
  let departmentsCreated = 0;
  let departmentsSkipped = 0;
  let devicesCreated = 0;
  let devicesSkipped = 0;

  try {
    const hospital = await prisma.hospital.findUnique({
      where: { id: selectedHospitalId },
      select: { id: true, name: true },
    });
    if (!hospital) {
      throw new Error(`Nie znaleziono szpitala ${selectedHospitalId}.`);
    }

    const departments = new Map<string, string>();
    for (const name of ['SOR', 'Neonatologia', 'Blok operacyjny']) {
      const existing = await prisma.department.findFirst({
        where: { hospitalId: selectedHospitalId, name },
        select: { id: true },
      });
      if (existing) {
        departments.set(name, existing.id);
        departmentsSkipped += 1;
      } else {
        const created = await prisma.department.create({
          data: { hospitalId: selectedHospitalId, name },
          select: { id: true },
        });
        departments.set(name, created.id);
        departmentsCreated += 1;
      }
    }

    const devices = [
      {
        name: 'Respirator Airvo 3',
        manufacturer: 'Fisher & Paykel',
        model: 'Airvo 3',
        serialNo: 'EMMA-DEMO-SN-001',
        inventoryNo: 'EMMA-DEMO-INV-001',
        category: 'Respiratory',
        departmentId: departments.get('SOR'),
      },
      {
        name: 'Defibrylator BeneHeart',
        manufacturer: 'Mindray',
        model: 'D3',
        serialNo: 'EMMA-DEMO-SN-002',
        inventoryNo: 'EMMA-DEMO-INV-002',
        category: 'Cardiology',
        departmentId: departments.get('SOR'),
      },
      {
        name: 'Inkubator noworodkowy',
        manufacturer: 'Dräger',
        model: 'Isolette C2000',
        serialNo: 'EMMA-DEMO-SN-003',
        inventoryNo: 'EMMA-DEMO-INV-003',
        category: 'Neonatology',
        departmentId: departments.get('Neonatologia'),
      },
      {
        name: 'Kardiomonitor',
        manufacturer: 'Philips',
        model: 'IntelliVue MX450',
        serialNo: 'EMMA-DEMO-SN-004',
        inventoryNo: 'EMMA-DEMO-INV-004',
        category: 'Monitoring',
        departmentId: departments.get('Neonatologia'),
      },
      {
        name: 'Aparat do znieczulenia',
        manufacturer: 'GE Healthcare',
        model: 'Carestation 650',
        serialNo: 'EMMA-DEMO-SN-005',
        inventoryNo: 'EMMA-DEMO-INV-005',
        category: 'Anesthesiology',
        departmentId: departments.get('Blok operacyjny'),
      },
      {
        name: 'Pompa infuzyjna',
        manufacturer: 'B. Braun',
        model: 'Infusomat Space',
        serialNo: 'EMMA-DEMO-SN-006',
        inventoryNo: 'EMMA-DEMO-INV-006',
        category: 'Infusion',
        departmentId: null,
      },
    ];

    for (const device of devices) {
      const exists = await prisma.device.findFirst({
        where: {
          hospitalId: selectedHospitalId,
          inventoryNo: device.inventoryNo,
        },
        select: { id: true },
      });
      if (exists) {
        devicesSkipped += 1;
      } else {
        await prisma.device.create({
          data: { ...device, hospitalId: selectedHospitalId },
        });
        devicesCreated += 1;
      }
    }

    console.log(`Szpital: ${hospital.name} (${hospital.id})`);
    console.log(
      `Oddziały — utworzone: ${departmentsCreated}, pominięte: ${departmentsSkipped}.`,
    );
    console.log(
      `Urządzenia — utworzone: ${devicesCreated}, pominięte: ${devicesSkipped}.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Seed nie powiódł się.');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
