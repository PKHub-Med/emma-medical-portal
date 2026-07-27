import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NotFoundException } from '@nestjs/common';
import { DevicesService } from '../src/devices/devices.service';
import { DepartmentsService } from '../src/devices/departments.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { CurrentHospitalScope } from '../src/portal-hospitals/current-hospital-scope.service';

const hospitalId = '348f0785-8427-4d33-97ee-61cae8e91e42';
const otherHospitalId = '0ea8b102-bb01-42da-8900-cc19586e9e68';
const deviceId = '93027cb0-b139-4ed0-8328-a00328368d8a';
const departmentId = 'fa983def-0fc0-4d10-b735-96d7a69bf440';

describe('Portal devices', () => {
  const findMany = jest.fn();
  const count = jest.fn();
  const findFirst = jest.fn();
  const transaction = jest.fn();
  const departmentFindMany = jest.fn();
  const prisma = {
    device: { findMany, count, findFirst },
    department: { findMany: departmentFindMany },
    $transaction: transaction,
  };
  const scope = {
    resolve: jest.fn().mockResolvedValue({
      id: hospitalId,
      name: 'Szpital Miejski',
      role: 'HOSPITAL_USER',
    }),
  };
  let service: DevicesService;

  beforeEach(() => {
    jest.clearAllMocks();
    scope.resolve.mockResolvedValue({
      id: hospitalId,
      name: 'Szpital Miejski',
      role: 'HOSPITAL_USER',
    });
    transaction.mockResolvedValue([[], 0]);
    service = new DevicesService(
      prisma as unknown as PrismaService,
      scope as unknown as CurrentHospitalScope,
    );
  });

  it('lists and counts only devices from the active hospital', async () => {
    await service.list('user-id', 'session-id', {});

    expect(scope.resolve).toHaveBeenCalledWith('user-id', 'session-id');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { hospitalId } }),
    );
    expect(count).toHaveBeenCalledWith({ where: { hospitalId } });
  });

  it('applies the department filter inside active hospital scope', async () => {
    await service.list('user-id', 'session-id', { departmentId });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { hospitalId, departmentId },
      }),
    );
  });

  it.each(['EMMA-DEMO-SN-001', 'EMMA-DEMO-INV-001'])(
    'searches serial and inventory fields for %s',
    async (search) => {
      await service.list('user-id', 'session-id', { search });
      const where = findMany.mock.calls[0][0].where;
      expect(where.hospitalId).toBe(hospitalId);
      expect(where.OR).toEqual(
        expect.arrayContaining([
          { serialNo: { contains: search, mode: 'insensitive' } },
          { inventoryNo: { contains: search, mode: 'insensitive' } },
        ]),
      );
    },
  );

  it('does not return a known UUID belonging to another hospital', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.get('user-id', 'session-id', deviceId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: deviceId, hospitalId },
      }),
    );
    expect(findFirst).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { hospitalId: otherHospitalId } }),
    );
  });

  it('returns only active departments of the active hospital', async () => {
    departmentFindMany.mockResolvedValue([]);
    const departments = new DepartmentsService(
      prisma as unknown as PrismaService,
      scope as unknown as CurrentHospitalScope,
    );

    await expect(
      departments.list('user-id', 'session-id'),
    ).resolves.toEqual({ items: [] });
    expect(departmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { hospitalId, active: true },
      }),
    );
  });

  it('allows null department and enforces cross-hospital assignment in DB', () => {
    const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
    const migration = deviceMigration();

    expect(schema).toMatch(/departmentId\s+String\?/);
    expect(migration).toContain('"department_id" UUID');
    expect(migration).toContain(
      'FOREIGN KEY ("department_id", "hospital_id")',
    );
    expect(migration).toContain(
      'REFERENCES "departments"("id", "hospital_id")',
    );
  });

  it('requires serialNo or inventoryNo at database level', () => {
    const migration = deviceMigration();
    expect(migration).toContain('CONSTRAINT "devices_identifier_check"');
    expect(migration).toContain('NULLIF(BTRIM("serial_no"), \'\')');
    expect(migration).toContain('NULLIF(BTRIM("inventory_no"), \'\')');
  });

  it('blocks inventory duplicates per hospital but permits the same number across hospitals', () => {
    const migration = deviceMigration();
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "devices_hospital_id_inventory_no_key"',
    );
    expect(migration).toContain(
      'ON "devices"("hospital_id", "inventory_no")',
    );
    expect(migration).toContain('WHERE "inventory_no" IS NOT NULL');
  });
});

function deviceMigration() {
  return readFileSync(
    resolve(
      'prisma/migrations/20260728010000_add_devices/migration.sql',
    ),
    'utf8',
  );
}
