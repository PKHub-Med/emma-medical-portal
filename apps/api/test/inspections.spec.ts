import { NotFoundException } from '@nestjs/common';
import { inspectionDayBoundaries } from '../src/inspections/inspection-dates';
import { InspectionsService } from '../src/inspections/inspections.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { CurrentHospitalScope } from '../src/portal-hospitals/current-hospital-scope.service';
import { seedInspections } from '../src/scripts/demo-seed-inspections';

const hospitalId = '348f0785-8427-4d33-97ee-61cae8e91e42';
const inspectionId = '93027cb0-b139-4ed0-8328-a00328368d8a';
const now = new Date('2026-07-28T10:00:00Z');

describe('Portal inspections', () => {
  const findMany = jest.fn();
  const count = jest.fn();
  const findFirst = jest.fn();
  const historyFindMany = jest.fn();
  const transaction = jest.fn();
  const prisma = {
    inspection: { findMany, count, findFirst },
    statusHistory: { findMany: historyFindMany },
    $transaction: transaction,
  };
  const scope = {
    resolve: jest.fn().mockResolvedValue({
      id: hospitalId,
      name: 'Szpital Miejski',
      role: 'HOSPITAL_USER',
    }),
  };
  let service: InspectionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockResolvedValue([[], 0]);
    service = new InspectionsService(
      prisma as unknown as PrismaService,
      scope as unknown as CurrentHospitalScope,
    );
  });

  it('lists and counts only inspections reached through the active hospital', async () => {
    await service.list('user-id', 'session-id', {}, now);
    expect(scope.resolve).toHaveBeenCalledWith('user-id', 'session-id');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ device: { hospitalId } }),
    }));
    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({ device: { hospitalId } }),
    });
  });

  it('applies overdue and next30days as disjoint non-terminal ranges', async () => {
    await service.list('user-id', 'session-id', { due: 'overdue' }, now);
    expect(findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({
      isTerminal: false,
      dueAt: { lt: new Date('2026-07-27T22:00:00.000Z') },
    }));
    await service.list('user-id', 'session-id', { due: 'next30days' }, now);
    expect(findMany.mock.calls[1][0].where).toEqual(expect.objectContaining({
      isTerminal: false,
      dueAt: {
        gte: new Date('2026-07-27T22:00:00.000Z'),
        lt: new Date('2026-08-27T22:00:00.000Z'),
      },
    }));
  });

  it.each(['P-2026-0081', 'SN-001', 'INV-001'])(
    'searches business number, serial number and inventory number for %s',
    async (search) => {
      await service.list('user-id', 'session-id', { search }, now);
      expect(findMany.mock.calls[0][0].where.OR).toEqual(expect.arrayContaining([
        { businessNumber: { contains: search, mode: 'insensitive' } },
        { device: { is: { hospitalId, serialNo: { contains: search, mode: 'insensitive' } } } },
        { device: { is: { hospitalId, inventoryNo: { contains: search, mode: 'insensitive' } } } },
      ]));
    },
  );

  it('marks only unfinished records before the local-day boundary as overdue', async () => {
    const device = {
      id: 'device-id',
      name: 'Respirator',
      serialNo: null,
      inventoryNo: null,
      department: null,
    };
    transaction.mockResolvedValue([[
      baseRow({ dueAt: new Date('2026-07-26T12:00:00Z'), isTerminal: false, device }),
      baseRow({ id: 'terminal', dueAt: new Date('2026-07-20T12:00:00Z'), isTerminal: true, device }),
    ], 2]);
    const result = await service.list('user-id', 'session-id', {}, now);
    expect(result.items.find((item) => item.id === inspectionId)?.isOverdue).toBe(true);
    expect(result.items.find((item) => item.id === 'terminal')?.isOverdue).toBe(false);
  });

  it('does not return a known inspection UUID from another hospital', async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.get('user-id', 'session-id', inspectionId, now))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: inspectionId, device: { hospitalId } },
    }));
  });

  it('returns customer history without source synchronization fields', async () => {
    findFirst.mockResolvedValue({
      ...baseRow({ device: {
        id: 'device-id',
        name: 'Respirator',
        manufacturer: null,
        model: null,
        serialNo: 'SN-001',
        inventoryNo: null,
        department: null,
        hospital: { id: hospitalId, name: 'Szpital Miejski' },
      } }),
      completedAt: null,
      customerDescription: 'Opis',
    });
    historyFindMany.mockResolvedValue([{
      id: 'history-id',
      newStatusCode: 'PLANNED',
      newLabel: 'Zaplanowany',
      changedAt: now,
    }]);
    const result = await service.get('user-id', 'session-id', inspectionId, now);
    expect(result.statusHistory).toEqual([expect.objectContaining({
      statusCode: 'PLANNED',
      label: 'Zaplanowany',
    })]);
    expect(JSON.stringify(result)).not.toContain('sourceStatus');
    expect(JSON.stringify(result)).not.toContain('sourceRecordId');
  });

  it('uses Europe/Warsaw rather than the process timezone for day boundaries', () => {
    const boundaries = inspectionDayBoundaries(now, 'Europe/Warsaw');
    expect(boundaries.startToday.toISOString()).toBe('2026-07-27T22:00:00.000Z');
    expect(boundaries.startDay31.toISOString()).toBe('2026-08-27T22:00:00.000Z');
  });
});

describe('Inspection demo seed', () => {
  it('is idempotent for all eight deterministic records', async () => {
    const mockPrisma = {
      hospital: {
        findUnique: jest.fn().mockResolvedValue({ id: hospitalId, name: 'Szpital' }),
      },
      device: { findMany: jest.fn().mockResolvedValue([{ id: 'device-id' }]) },
      inspection: {
        findUnique: jest.fn().mockResolvedValue({ id: 'existing-inspection' }),
        create: jest.fn(),
      },
      statusHistory: { createMany: jest.fn() },
      $disconnect: jest.fn(),
    };
    await expect(seedInspections(
      hospitalId,
      mockPrisma as unknown as PrismaService,
      now,
    )).resolves.toEqual({ created: 0, skipped: 8, historyCreated: 0 });
    expect(mockPrisma.inspection.findUnique).toHaveBeenCalledTimes(8);
    expect(mockPrisma.inspection.create).not.toHaveBeenCalled();
    expect(mockPrisma.statusHistory.createMany).not.toHaveBeenCalled();
  });
});

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: inspectionId,
    businessNumber: 'P-2026-0081',
    customerStatusCode: 'PLANNED',
    customerLabel: 'Zaplanowany',
    result: null,
    isTerminal: false,
    plannedAt: new Date('2026-08-20T08:00:00Z'),
    performedAt: null,
    dueAt: new Date('2026-08-27T08:00:00Z'),
    updatedAt: now,
    ...overrides,
  };
}
