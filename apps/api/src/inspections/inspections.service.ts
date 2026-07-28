import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentHospitalScope } from '../portal-hospitals/current-hospital-scope.service';
import {
  inspectionDayBoundaries,
  portalDateBoundary,
} from './inspection-dates';
import type {
  InspectionDue,
  InspectionListItem,
  InspectionsPage,
  InspectionsQuery,
} from './inspections.types';

const inspectionListSelect = {
  id: true,
  businessNumber: true,
  customerStatusCode: true,
  customerLabel: true,
  result: true,
  isTerminal: true,
  plannedAt: true,
  performedAt: true,
  dueAt: true,
  updatedAt: true,
  device: {
    select: {
      id: true,
      name: true,
      serialNo: true,
      inventoryNo: true,
      department: { select: { id: true, name: true } },
    },
  },
} as const;

@Injectable()
export class InspectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hospitalScope: CurrentHospitalScope,
  ) {}

  async list(
    userId: string,
    sessionId: string,
    query: InspectionsQuery,
    now = new Date(),
  ): Promise<InspectionsPage> {
    const hospital = await this.hospitalScope.resolve(userId, sessionId);
    const page = positiveInteger(query.page, 'page', 1);
    const pageSize = positiveInteger(query.pageSize, 'pageSize', 25, 100);
    const search = optionalText(query.search, 'search', 200);
    const status = optionalText(query.status, 'status', 100);
    const result = optionalText(query.result, 'result', 200);
    const departmentId = query.departmentId?.trim() || undefined;
    const due = validDue(query.due);
    const dateFrom = portalDateBoundary(query.dateFrom, 'dateFrom', false);
    const dateToExclusive = portalDateBoundary(query.dateTo, 'dateTo', true);
    const { startToday, startDay31 } = inspectionDayBoundaries(now);

    if (departmentId && !isUuid(departmentId)) {
      throw new BadRequestException('Identyfikator oddziału jest nieprawidłowy.');
    }
    if (dateFrom && dateToExclusive && dateFrom >= dateToExclusive) {
      throw new BadRequestException('Zakres dat jest nieprawidłowy.');
    }

    const device: Prisma.DeviceWhereInput = {
      hospitalId: hospital.id,
      ...(departmentId ? { departmentId } : {}),
    };
    const dueFilter: Prisma.InspectionWhereInput =
      due === 'overdue'
        ? { isTerminal: false, dueAt: { lt: startToday } }
        : due === 'next30days'
          ? { isTerminal: false, dueAt: { gte: startToday, lt: startDay31 } }
          : due === 'future'
            ? { isTerminal: false, dueAt: { gte: startDay31 } }
            : {};
    const where: Prisma.InspectionWhereInput = {
      device,
      ...dueFilter,
      ...(status
        ? { customerStatusCode: { equals: status, mode: 'insensitive' } }
        : {}),
      ...(result
        ? { result: { equals: result, mode: 'insensitive' } }
        : {}),
      ...(dateFrom || dateToExclusive
        ? {
            plannedAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateToExclusive ? { lt: dateToExclusive } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { businessNumber: { contains: search, mode: 'insensitive' } },
              { device: { is: { ...device, name: { contains: search, mode: 'insensitive' } } } },
              { device: { is: { ...device, serialNo: { contains: search, mode: 'insensitive' } } } },
              { device: { is: { ...device, inventoryNo: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    try {
      const [rows, totalCount] = await this.prisma.$transaction([
        this.prisma.inspection.findMany({
          where,
          select: inspectionListSelect,
        }),
        this.prisma.inspection.count({ where }),
      ]);
      const sorted = rows
        .map(({ device: rowDevice, ...inspection }) => ({
          ...inspection,
          isOverdue: isInspectionOverdue(
            inspection.dueAt,
            inspection.isTerminal,
            startToday,
          ),
          device: {
            id: rowDevice.id,
            name: rowDevice.name,
            serialNo: rowDevice.serialNo,
            inventoryNo: rowDevice.inventoryNo,
          },
          department: rowDevice.department,
        }))
        .sort(compareInspections);
      return {
        items: sorted.slice((page - 1) * pageSize, page * pageSize) as InspectionListItem[],
        page,
        pageSize,
        totalCount,
      };
    } catch {
      throw new ServiceUnavailableException('Nie udało się pobrać listy przeglądów.');
    }
  }

  async get(userId: string, sessionId: string, id: string, now = new Date()) {
    if (!isUuid(id)) throw new NotFoundException('Nie znaleziono przeglądu.');
    const hospital = await this.hospitalScope.resolve(userId, sessionId);
    try {
      const inspection = await this.prisma.inspection.findFirst({
        where: { id, device: { hospitalId: hospital.id } },
        select: {
          id: true,
          businessNumber: true,
          customerStatusCode: true,
          customerLabel: true,
          result: true,
          isTerminal: true,
          plannedAt: true,
          performedAt: true,
          dueAt: true,
          completedAt: true,
          customerDescription: true,
          device: {
            select: {
              id: true,
              name: true,
              manufacturer: true,
              model: true,
              serialNo: true,
              inventoryNo: true,
              department: { select: { id: true, name: true } },
              hospital: { select: { id: true, name: true } },
            },
          },
        },
      });
      if (!inspection) throw new NotFoundException('Nie znaleziono przeglądu.');
      const history = await this.prisma.statusHistory.findMany({
        where: { entityType: 'INSPECTION', entityId: inspection.id },
        select: { id: true, newStatusCode: true, newLabel: true, changedAt: true },
        orderBy: { changedAt: 'asc' },
      });
      const { startToday } = inspectionDayBoundaries(now);
      return {
        ...inspection,
        isOverdue: isInspectionOverdue(
          inspection.dueAt,
          inspection.isTerminal,
          startToday,
        ),
        statusHistory: history.map((entry) => ({
          id: entry.id,
          statusCode: entry.newStatusCode,
          label: entry.newLabel,
          changedAt: entry.changedAt,
        })),
        documents: [],
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new ServiceUnavailableException('Nie udało się pobrać przeglądu.');
    }
  }
}

export function isInspectionOverdue(
  dueAt: Date | null,
  isTerminal: boolean,
  startToday: Date,
) {
  return !isTerminal && dueAt !== null && dueAt < startToday;
}

export function compareInspections(
  left: { isOverdue: boolean; dueAt: Date | null },
  right: { isOverdue: boolean; dueAt: Date | null },
) {
  if (left.isOverdue !== right.isOverdue) return left.isOverdue ? -1 : 1;
  if (left.dueAt === null) return right.dueAt === null ? 0 : 1;
  if (right.dueAt === null) return -1;
  return left.dueAt.getTime() - right.dueAt.getTime();
}

function positiveInteger(value: string | undefined, field: string, fallback: number, maximum?: number) {
  if (!value) return fallback;
  if (!/^\d+$/.test(value)) invalidParameter(field);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || (maximum && parsed > maximum)) invalidParameter(field);
  return parsed;
}

function optionalText(value: string | undefined, field: string, maximum: number) {
  const text = value?.trim();
  if (!text) return undefined;
  if (text.length > maximum) {
    throw new BadRequestException(`Parametr ${field} jest zbyt długi.`);
  }
  return text;
}

function validDue(value: string | undefined): InspectionDue {
  const due = value?.trim() || 'all';
  if (!['overdue', 'next30days', 'future', 'all'].includes(due)) {
    invalidParameter('due');
  }
  return due as InspectionDue;
}

function invalidParameter(field: string): never {
  throw new BadRequestException(`Parametr ${field} ma nieprawidłową wartość.`);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
