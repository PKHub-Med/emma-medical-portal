import { NotFoundException } from '@nestjs/common';
import { RepairsService } from '../src/repairs/repairs.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { CurrentHospitalScope } from '../src/portal-hospitals/current-hospital-scope.service';
import { seedRepairs } from '../src/scripts/demo-seed-repairs';

const hospitalId = '348f0785-8427-4d33-97ee-61cae8e91e42';
const repairId = '93027cb0-b139-4ed0-8328-a00328368d8a';

describe('Portal repairs', () => {
  const findMany = jest.fn();
  const count = jest.fn();
  const findFirst = jest.fn();
  const historyFindMany = jest.fn();
  const transaction = jest.fn();
  const prisma = {
    repair: { findMany, count, findFirst },
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
  let service: RepairsService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockResolvedValue([[], 0]);
    service = new RepairsService(
      prisma as unknown as PrismaService,
      scope as unknown as CurrentHospitalScope,
    );
  });

  it('lists and counts repairs only through devices of active hospital', async () => {
    await service.list('user-id', 'session-id', {});
    expect(scope.resolve).toHaveBeenCalledWith('user-id', 'session-id');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        device: { hospitalId },
        isTerminal: false,
      }),
    }));
    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({ device: { hospitalId } }),
    });
  });

  it.each([
    ['open', false],
    ['closed', true],
  ])('applies the %s terminal filter', async (state, expected) => {
    await service.list('user-id', 'session-id', { state });
    expect(findMany.mock.calls[0][0].where.isTerminal).toBe(expected);
  });

  it('does not apply terminal filter for all', async () => {
    await service.list('user-id', 'session-id', { state: 'all' });
    expect(findMany.mock.calls[0][0].where).not.toHaveProperty('isTerminal');
  });

  it.each(['N-2026-0142', 'SN-001', 'INV-001'])(
    'searches business number, serial number and inventory number for %s',
    async (search) => {
      await service.list('user-id', 'session-id', { search });
      expect(findMany.mock.calls[0][0].where.OR).toEqual(expect.arrayContaining([
        { businessNumber: { contains: search, mode: 'insensitive' } },
        { device: { is: { hospitalId, serialNo: { contains: search, mode: 'insensitive' } } } },
        { device: { is: { hospitalId, inventoryNo: { contains: search, mode: 'insensitive' } } } },
      ]));
    },
  );

  it('does not return a known repair UUID from another hospital', async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.get('user-id', 'session-id', repairId))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: repairId, device: { hospitalId } },
    }));
  });

  it('returns customer history without source synchronization fields', async () => {
    findFirst.mockResolvedValue({
      id: repairId,
      businessNumber: 'N-2026-0142',
      customerStatusCode: 'IN_PROGRESS',
      customerLabel: 'W trakcie naprawy',
      isTerminal: false,
      reportedAt: new Date(),
      acceptedAt: null,
      startedAt: null,
      completedAt: null,
      customerDescription: 'Opis',
      device: {
        id: 'device-id',
        name: 'Respirator',
        manufacturer: null,
        model: null,
        serialNo: 'SN-001',
        inventoryNo: null,
        department: null,
        hospital: { id: hospitalId, name: 'Szpital Miejski' },
      },
    });
    historyFindMany.mockResolvedValue([{
      id: 'history-id',
      newStatusCode: 'IN_PROGRESS',
      newLabel: 'W trakcie naprawy',
      changedAt: new Date(),
    }]);
    const result = await service.get('user-id', 'session-id', repairId);
    expect(result.statusHistory[0]).toEqual(expect.objectContaining({
      statusCode: 'IN_PROGRESS',
      label: 'W trakcie naprawy',
    }));
    expect(result).not.toHaveProperty('sourceStatus');
    expect(JSON.stringify(result)).not.toContain('sourceRecordId');
  });
});

describe('Repair demo seed', () => {
  it('skips deterministic demo numbers when rerun', async () => {
    const mockPrisma = {
      hospital: {
        findUnique: jest.fn().mockResolvedValue({ id: hospitalId, name: 'Szpital' }),
      },
      device: {
        findMany: jest.fn().mockResolvedValue([{ id: 'device-id' }]),
      },
      repair: {
        findUnique: jest.fn().mockResolvedValue({ id: 'existing-repair' }),
        create: jest.fn(),
      },
      statusHistory: { createMany: jest.fn() },
      $disconnect: jest.fn(),
    };
    await expect(seedRepairs(
      hospitalId,
      mockPrisma as unknown as PrismaService,
    )).resolves.toEqual({ created: 0, skipped: 6, historyCreated: 0 });
    expect(mockPrisma.repair.findUnique).toHaveBeenCalledTimes(6);
    expect(mockPrisma.repair.create).not.toHaveBeenCalled();
    expect(mockPrisma.statusHistory.createMany).not.toHaveBeenCalled();
  });
});
