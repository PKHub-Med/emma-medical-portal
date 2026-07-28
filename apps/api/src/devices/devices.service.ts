import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentHospitalScope } from '../portal-hospitals/current-hospital-scope.service';
import type {
  DeviceDetails,
  DeviceListItem,
  DevicesPage,
  DevicesQuery,
} from './devices.types';
import { inspectionDayBoundaries } from '../inspections/inspection-dates';
import {
  compareInspections,
  isInspectionOverdue,
} from '../inspections/inspections.service';

const deviceListSelect = {
  id: true,
  name: true,
  manufacturer: true,
  model: true,
  serialNo: true,
  inventoryNo: true,
  category: true,
  active: true,
  department: { select: { id: true, name: true } },
} as const;

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hospitalScope: CurrentHospitalScope,
  ) {}

  async list(
    userId: string,
    sessionId: string,
    query: DevicesQuery,
  ): Promise<DevicesPage> {
    const hospital = await this.hospitalScope.resolve(userId, sessionId);
    const page = positiveInteger(query.page, 'page', 1);
    const pageSize = positiveInteger(query.pageSize, 'pageSize', 25, 100);
    const search = optionalText(query.search, 'search', 200);
    const manufacturer = optionalText(query.manufacturer, 'manufacturer', 200);
    const category = optionalText(query.category, 'category', 200);
    const active = optionalBoolean(query.active, 'active');
    const departmentId = query.departmentId?.trim() || undefined;

    if (departmentId && !isUuid(departmentId)) {
      throw new BadRequestException('Identyfikator oddziału jest nieprawidłowy.');
    }

    const where: Prisma.DeviceWhereInput = {
      hospitalId: hospital.id,
      ...(departmentId ? { departmentId } : {}),
      ...(manufacturer
        ? { manufacturer: { equals: manufacturer, mode: 'insensitive' } }
        : {}),
      ...(category ? { category: { equals: category, mode: 'insensitive' } } : {}),
      ...(active === undefined ? {} : { active }),
      ...(search
        ? {
            OR: ['name', 'manufacturer', 'model', 'serialNo', 'inventoryNo'].map(
              (field) => ({ [field]: { contains: search, mode: 'insensitive' } }),
            ),
          }
        : {}),
    };

    try {
      const [items, totalCount] = await this.prisma.$transaction([
        this.prisma.device.findMany({
          where,
          select: deviceListSelect,
          orderBy: [{ name: 'asc' }, { inventoryNo: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.device.count({ where }),
      ]);
      return {
        items: items as DeviceListItem[],
        page,
        pageSize,
        totalCount,
      };
    } catch {
      throw new ServiceUnavailableException(
        'Nie udało się pobrać listy urządzeń.',
      );
    }
  }

  async get(
    userId: string,
    sessionId: string,
    id: string,
  ): Promise<DeviceDetails> {
    if (!isUuid(id)) {
      throw new NotFoundException('Nie znaleziono urządzenia.');
    }
    const hospital = await this.hospitalScope.resolve(userId, sessionId);
    let device;
    try {
      device = await this.prisma.device.findFirst({
        where: { id, hospitalId: hospital.id },
        select: {
          ...deviceListSelect,
          qrEpc: true,
          passportNo: true,
          hospital: { select: { id: true, name: true } },
          repairs: {
            select: {
              id: true,
              businessNumber: true,
              customerStatusCode: true,
              customerLabel: true,
              reportedAt: true,
              completedAt: true,
            },
            orderBy: [
              { reportedAt: { sort: 'desc', nulls: 'last' } },
              { createdAt: 'desc' },
            ],
          },
          inspections: {
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
            },
          },
        },
      });
    } catch {
      throw new ServiceUnavailableException(
        'Nie udało się pobrać urządzenia.',
      );
    }
    if (!device) {
      throw new NotFoundException('Nie znaleziono urządzenia.');
    }
    const { startToday } = inspectionDayBoundaries();
    const inspections = (device.inspections ?? [])
      .map(({ isTerminal, ...inspection }) => ({
        ...inspection,
        isOverdue: isInspectionOverdue(
          inspection.dueAt,
          isTerminal,
          startToday,
        ),
      }))
      .sort(compareInspections);
    return {
      ...(device as Omit<DeviceDetails, 'inspections' | 'documents'>),
      inspections,
      documents: [],
    };
  }
}

function positiveInteger(
  value: string | undefined,
  field: string,
  fallback: number,
  maximum?: number,
): number {
  if (!value) return fallback;
  if (!/^\d+$/.test(value)) {
    throw new BadRequestException(`Parametr ${field} ma nieprawidłową wartość.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || (maximum && parsed > maximum)) {
    throw new BadRequestException(`Parametr ${field} ma nieprawidłową wartość.`);
  }
  return parsed;
}

function optionalText(
  value: string | undefined,
  field: string,
  maximum: number,
): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  if (text.length > maximum) {
    throw new BadRequestException(`Parametr ${field} jest zbyt długi.`);
  }
  return text;
}

function optionalBoolean(value: string | undefined, field: string) {
  if (value === undefined || value === '') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new BadRequestException(
    `Parametr ${field} musi mieć wartość true albo false.`,
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
