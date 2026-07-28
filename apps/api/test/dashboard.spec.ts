import { DashboardService } from '../src/dashboard/dashboard.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { CurrentHospitalScope } from '../src/portal-hospitals/current-hospital-scope.service';

const hospitalId = '348f0785-8427-4d33-97ee-61cae8e91e42';
const now = new Date('2026-07-28T10:00:00Z');

describe('Portal dashboard summary', () => {
  const repairCount = jest.fn();
  const inspectionCount = jest.fn();
  const inspectionFindMany = jest.fn();
  const deviceCount = jest.fn();
  const queryRaw = jest.fn();
  const transaction = jest.fn();
  const prisma = {
    repair: { count: repairCount },
    inspection: { count: inspectionCount, findMany: inspectionFindMany },
    device: { count: deviceCount },
    $queryRaw: queryRaw,
    $transaction: transaction,
  };
  const scope = {
    resolve: jest.fn().mockResolvedValue({
      id: hospitalId,
      name: 'Szpital Miejski',
      role: 'HOSPITAL_USER',
    }),
  };
  let service: DashboardService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockResolvedValue([0, 0, 0, 0, [], []]);
    service = new DashboardService(
      prisma as unknown as PrismaService,
      scope as unknown as CurrentHospitalScope,
    );
  });

  it('counts only non-terminal, non-deleted repairs on active devices of the active hospital', async () => {
    transaction.mockResolvedValue([12, 0, 0, 0, [], []]);
    const result = await service.summary('user-id', 'session-id', now);

    expect(result.openRepairs).toBe(12);
    expect(repairCount).toHaveBeenCalledWith({
      where: {
        isTerminal: false,
        sourceDeletedAt: null,
        device: {
          hospitalId,
          active: true,
          sourceDeletedAt: null,
        },
      },
    });
  });

  it('excludes completed repairs through the isTerminal filter', async () => {
    await service.summary('user-id', 'session-id', now);
    expect(repairCount.mock.calls[0][0].where.isTerminal).toBe(false);
  });

  it('uses APP_TIMEZONE boundaries for overdue inspections', async () => {
    await service.summary('user-id', 'session-id', now);
    expect(inspectionCount.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        isTerminal: false,
        dueAt: { lt: new Date('2026-07-27T22:00:00.000Z') },
      }),
    );
  });

  it('keeps next 30 days disjoint from overdue and excludes terminal inspections', async () => {
    await service.summary('user-id', 'session-id', now);
    expect(inspectionCount.mock.calls[1][0].where).toEqual(
      expect.objectContaining({
        isTerminal: false,
        dueAt: {
          gte: new Date('2026-07-27T22:00:00.000Z'),
          lt: new Date('2026-08-27T22:00:00.000Z'),
        },
      }),
    );
  });

  it('counts only active, non-deleted devices of the active hospital', async () => {
    transaction.mockResolvedValue([0, 0, 0, 146, [], []]);
    const result = await service.summary('user-id', 'session-id', now);
    expect(result.devices).toBe(146);
    expect(deviceCount).toHaveBeenCalledWith({
      where: { hospitalId, active: true, sourceDeletedAt: null },
    });
  });

  it('scopes every KPI to devices of the resolved hospital', async () => {
    await service.summary('user-id', 'session-id', now);
    expect(scope.resolve).toHaveBeenCalledWith('user-id', 'session-id');
    expect(repairCount.mock.calls[0][0].where.device.hospitalId).toBe(hospitalId);
    expect(inspectionCount.mock.calls[0][0].where.device.hospitalId).toBe(hospitalId);
    expect(inspectionCount.mock.calls[1][0].where.device.hospitalId).toBe(hospitalId);
    expect(deviceCount.mock.calls[0][0].where.hospitalId).toBe(hospitalId);
  });

  it('returns recent status changes already filtered to the active hospital', async () => {
    const changedAt = new Date('2026-07-28T10:00:00Z');
    transaction.mockResolvedValue([
      0,
      0,
      0,
      0,
      [],
      [
        {
          id: 'local',
          entityType: 'INSPECTION',
          entityId: 'local-inspection',
          businessNumber: 'P-2026-0081',
          deviceName: 'Nawilżacz MR850',
          statusCode: 'IN_PROGRESS',
          label: 'W trakcie',
          changedAt,
        },
      ],
    ]);

    const result = await service.summary('user-id', 'session-id', now);

    expect(result.recentStatusChanges).toHaveLength(1);
    expect(result.recentStatusChanges[0].id).toBe('local');
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const query = queryRaw.mock.calls[0][0];
    expect(query.strings.join(' ')).toContain('d.hospital_id');
    expect(query.values).toContain(hospitalId);
    expect(query.strings.join(' ')).toContain('LIMIT 5');
  });

  it('requests upcoming inspections in ascending order and computes local calendar days', async () => {
    transaction.mockResolvedValue([
      0,
      0,
      0,
      0,
      [{
        id: 'inspection-id',
        businessNumber: 'P-2026-0081',
        dueAt: new Date('2026-08-10T21:59:59Z'),
        device: {
          name: 'Nawilżacz MR850',
          department: { name: 'Neonatologia' },
        },
      }],
      [],
    ]);

    const result = await service.summary('user-id', 'session-id', now);

    expect(inspectionFindMany.mock.calls[0][0]).toEqual(expect.objectContaining({
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: 5,
    }));
    expect(result.upcomingInspections[0]).toEqual(expect.objectContaining({
      departmentName: 'Neonatologia',
      daysUntilDue: 13,
    }));
  });

  it('returns zeroes and empty arrays when the hospital has no data', async () => {
    await expect(service.summary('user-id', 'session-id', now)).resolves.toEqual({
      openRepairs: 0,
      overdueInspections: 0,
      inspectionsNext30Days: 0,
      devices: 0,
      recentStatusChanges: [],
      upcomingInspections: [],
    });
  });
});
