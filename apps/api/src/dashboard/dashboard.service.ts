import { Injectable } from '@nestjs/common';
import {
  APP_TIMEZONE,
  calendarDaysBetween,
  inspectionDayBoundaries,
} from '../inspections/inspection-dates';
import { CurrentHospitalScope } from '../portal-hospitals/current-hospital-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { DashboardStatusChange, DashboardSummary } from './dashboard.types';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hospitalScope: CurrentHospitalScope,
  ) {}

  async summary(
    userId: string,
    sessionId: string,
    now = new Date(),
  ): Promise<DashboardSummary> {
    const hospital = await this.hospitalScope.resolve(userId, sessionId);
    const { startToday, startDay31 } = inspectionDayBoundaries(
      now,
      APP_TIMEZONE,
    );
    const activeDevice = {
      hospitalId: hospital.id,
      active: true,
      sourceDeletedAt: null,
    };

    const [
      openRepairs,
      overdueInspections,
      inspectionsNext30Days,
      devices,
      upcomingRows,
      historyRows,
    ] = await this.prisma.$transaction([
      this.prisma.repair.count({
        where: {
          isTerminal: false,
          sourceDeletedAt: null,
          device: activeDevice,
        },
      }),
      this.prisma.inspection.count({
        where: {
          isTerminal: false,
          dueAt: { lt: startToday },
          device: activeDevice,
        },
      }),
      this.prisma.inspection.count({
        where: {
          isTerminal: false,
          dueAt: { gte: startToday, lt: startDay31 },
          device: activeDevice,
        },
      }),
      this.prisma.device.count({
        where: activeDevice,
      }),
      this.prisma.inspection.findMany({
        where: {
          isTerminal: false,
          dueAt: { gte: startToday },
          device: activeDevice,
        },
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        take: 5,
        select: {
          id: true,
          businessNumber: true,
          dueAt: true,
          device: {
            select: {
              name: true,
              department: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.$queryRaw<DashboardStatusChange[]>(Prisma.sql`
        SELECT
          sh.id,
          sh.entity_type::text AS "entityType",
          sh.entity_id AS "entityId",
          COALESCE(r.business_number, i.business_number) AS "businessNumber",
          d.name AS "deviceName",
          sh.new_status_code AS "statusCode",
          sh.new_label AS label,
          sh.changed_at AS "changedAt"
        FROM status_history sh
        LEFT JOIN repairs r
          ON sh.entity_type = 'REPAIR'
          AND r.id = sh.entity_id
          AND r.source_deleted_at IS NULL
        LEFT JOIN inspections i
          ON sh.entity_type = 'INSPECTION'
          AND i.id = sh.entity_id
        JOIN devices d ON d.id = COALESCE(r.device_id, i.device_id)
        WHERE sh.entity_type IN ('REPAIR', 'INSPECTION')
          AND d.hospital_id = ${hospital.id}::uuid
          AND d.active = true
          AND d.source_deleted_at IS NULL
        ORDER BY sh.changed_at DESC, sh.id DESC
        LIMIT 5
      `),
    ]);

    return {
      openRepairs,
      overdueInspections,
      inspectionsNext30Days,
      devices,
      recentStatusChanges: historyRows,
      upcomingInspections: upcomingRows.flatMap((inspection) =>
        inspection.dueAt
          ? [{
              id: inspection.id,
              businessNumber: inspection.businessNumber,
              deviceName: inspection.device.name,
              departmentName: inspection.device.department?.name ?? null,
              dueAt: inspection.dueAt,
              daysUntilDue: calendarDaysBetween(
                now,
                inspection.dueAt,
                APP_TIMEZONE,
              ),
            }]
          : [],
      ),
    };
  }

}
