import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentHospitalScope } from '../portal-hospitals/current-hospital-scope.service';
import type { RepairListItem, RepairsPage, RepairsQuery } from './repairs.types';

const repairListSelect = {
  id: true,
  businessNumber: true,
  customerStatusCode: true,
  customerLabel: true,
  isTerminal: true,
  reportedAt: true,
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
export class RepairsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hospitalScope: CurrentHospitalScope,
  ) {}

  async list(
    userId: string,
    sessionId: string,
    query: RepairsQuery,
  ): Promise<RepairsPage> {
    const hospital = await this.hospitalScope.resolve(userId, sessionId);
    const page = positiveInteger(query.page, 'page', 1);
    const pageSize = positiveInteger(query.pageSize, 'pageSize', 25, 100);
    const search = optionalText(query.search, 'search', 200);
    const status = optionalText(query.status, 'status', 100);
    const departmentId = query.departmentId?.trim() || undefined;
    const state = query.state?.trim() || 'open';
    const dateFrom = optionalDate(query.dateFrom, 'dateFrom', false);
    const dateTo = optionalDate(query.dateTo, 'dateTo', true);

    if (departmentId && !isUuid(departmentId)) {
      throw new BadRequestException('Identyfikator oddziału jest nieprawidłowy.');
    }
    if (!['open', 'closed', 'all'].includes(state)) {
      throw new BadRequestException('Parametr state ma nieprawidłową wartość.');
    }
    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new BadRequestException('Zakres dat jest nieprawidłowy.');
    }

    const device: Prisma.DeviceWhereInput = {
      hospitalId: hospital.id,
      ...(departmentId ? { departmentId } : {}),
    };
    const where: Prisma.RepairWhereInput = {
      device,
      ...(state === 'all' ? {} : { isTerminal: state === 'closed' }),
      ...(status
        ? { customerStatusCode: { equals: status, mode: 'insensitive' } }
        : {}),
      ...(dateFrom || dateTo
        ? { reportedAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
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
        this.prisma.repair.findMany({
          where,
          select: repairListSelect,
          orderBy: [{ isTerminal: 'asc' }, { updatedAt: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.repair.count({ where }),
      ]);
      const items = rows.map(({ device: rowDevice, ...repair }) => ({
        ...repair,
        device: {
          id: rowDevice.id,
          name: rowDevice.name,
          serialNo: rowDevice.serialNo,
          inventoryNo: rowDevice.inventoryNo,
        },
        department: rowDevice.department,
      })) as RepairListItem[];
      return { items, page, pageSize, totalCount };
    } catch {
      throw new ServiceUnavailableException('Nie udało się pobrać listy napraw.');
    }
  }

  async get(userId: string, sessionId: string, id: string) {
    if (!isUuid(id)) throw new NotFoundException('Nie znaleziono naprawy.');
    const hospital = await this.hospitalScope.resolve(userId, sessionId);
    try {
      const repair = await this.prisma.repair.findFirst({
        where: { id, device: { hospitalId: hospital.id } },
        select: {
          id: true,
          businessNumber: true,
          customerStatusCode: true,
          customerLabel: true,
          isTerminal: true,
          reportedAt: true,
          acceptedAt: true,
          startedAt: true,
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
      if (!repair) throw new NotFoundException('Nie znaleziono naprawy.');
      const history = await this.prisma.statusHistory.findMany({
        where: { entityType: 'REPAIR', entityId: repair.id },
        select: { id: true, newStatusCode: true, newLabel: true, changedAt: true },
        orderBy: { changedAt: 'asc' },
      });
      return {
        ...repair,
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
      throw new ServiceUnavailableException('Nie udało się pobrać naprawy.');
    }
  }
}

function positiveInteger(value: string | undefined, field: string, fallback: number, maximum?: number) {
  if (!value) return fallback;
  if (!/^\d+$/.test(value)) throw new BadRequestException(`Parametr ${field} ma nieprawidłową wartość.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || (maximum && parsed > maximum)) {
    throw new BadRequestException(`Parametr ${field} ma nieprawidłową wartość.`);
  }
  return parsed;
}

function optionalText(value: string | undefined, field: string, maximum: number) {
  const text = value?.trim();
  if (!text) return undefined;
  if (text.length > maximum) throw new BadRequestException(`Parametr ${field} jest zbyt długi.`);
  return text;
}

function optionalDate(value: string | undefined, field: string, endOfDay: boolean) {
  if (!value?.trim()) return undefined;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
    : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`Parametr ${field} ma nieprawidłową wartość.`);
  return date;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
