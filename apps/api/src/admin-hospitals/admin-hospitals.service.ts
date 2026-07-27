import {
  BadRequestException,
  Injectable,
  Optional,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuditRequestContext } from '../audit/audit.types';
import { AuditOutcome } from '../generated/prisma/enums';
import type {
  HospitalItem,
  HospitalsPage,
  HospitalsQuery,
} from './admin-hospitals.types';

const hospitalSelection = {
  id: true,
  name: true,
  active: true,
  portalEnabled: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      departments: true,
      memberships: true,
    },
  },
} as const;

type SelectedHospital = {
  id: string;
  name: string;
  active: boolean;
  portalEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    departments: number;
    memberships: number;
  };
};

@Injectable()
export class AdminHospitalsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  async list(query: HospitalsQuery): Promise<HospitalsPage> {
    const page = parsePositiveInteger(query.page, 'page', 1);
    const pageSize = parsePositiveInteger(
      query.pageSize,
      'pageSize',
      25,
      100,
    );
    const search = query.search?.trim();
    const active = parseOptionalBoolean(query.active, 'active');
    const portalEnabled = parseOptionalBoolean(
      query.portalEnabled,
      'portalEnabled',
    );

    if (search && search.length > 200) {
      throw new BadRequestException(
        'Wyszukiwana nazwa może mieć maksymalnie 200 znaków.',
      );
    }

    const where: Prisma.HospitalWhereInput = {
      ...(search
        ? { name: { contains: search, mode: 'insensitive' } }
        : {}),
      ...(active === undefined ? {} : { active }),
      ...(portalEnabled === undefined ? {} : { portalEnabled }),
    };

    try {
      const [hospitals, totalCount] = await this.prisma.$transaction([
        this.prisma.hospital.findMany({
          where,
          select: hospitalSelection,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.hospital.count({ where }),
      ]);

      return {
        items: (hospitals as SelectedHospital[]).map(toHospitalItem),
        page,
        pageSize,
        totalCount,
      };
    } catch {
      throw new ServiceUnavailableException(
        'Nie udało się pobrać listy szpitali.',
      );
    }
  }

  async create(
    body: unknown,
    actorId?: string,
    requestContext: AuditRequestContext = {},
  ): Promise<HospitalItem> {
    const data = parseCreateBody(body);

    try {
      const create = (client: typeof this.prisma) =>
        client.hospital.create({
          data: {
            name: data.name,
            active: true,
            portalEnabled: false,
          },
          select: hospitalSelection,
        });
      const hospital =
        this.auditService && actorId
          ? await this.prisma.$transaction(async (tx) => {
              const created = await create(tx as typeof this.prisma);
              await this.auditService!.record(
                {
                  actorId,
                  action: 'HOSPITAL_CREATED',
                  outcome: AuditOutcome.SUCCESS,
                  entityType: 'HOSPITAL',
                  entityId: created.id,
                  hospitalId: created.id,
                  metadata: { changedFields: ['name', 'active', 'portalEnabled'] },
                  ...requestContext,
                },
                tx,
              );
              return created;
            })
          : await create(this.prisma);

      return toHospitalItem(hospital as SelectedHospital);
    } catch {
      throw new InternalServerErrorException(
        'Nie udało się utworzyć szpitala.',
      );
    }
  }

  async update(
    id: string,
    body: unknown,
    actorId?: string,
    requestContext: AuditRequestContext = {},
  ): Promise<HospitalItem> {
    if (!isUuid(id)) {
      throw new BadRequestException(
        'Identyfikator szpitala jest nieprawidłowy.',
      );
    }

    const data = parseUpdateBody(body);

    try {
      const update = (client: typeof this.prisma) =>
        client.hospital.update({
          where: { id },
          data,
          select: hospitalSelection,
        });
      const hospital =
        this.auditService && actorId
          ? await this.prisma.$transaction(async (tx) => {
              const previous = await tx.hospital.findUnique({
                where: { id },
                select: { name: true, active: true, portalEnabled: true },
              });
              if (!previous) throw { code: 'P2025' };
              const updated = await update(tx as typeof this.prisma);
              const changedFields = Object.keys(data).filter(
                (field) =>
                  previous[field as keyof typeof previous] !==
                  data[field as keyof typeof data],
              );
              await this.auditService!.record(
                {
                  actorId,
                  action: 'HOSPITAL_UPDATED',
                  outcome: AuditOutcome.SUCCESS,
                  entityType: 'HOSPITAL',
                  entityId: id,
                  hospitalId: id,
                  metadata: {
                    changedFields,
                    previousValues: pick(previous, changedFields),
                    newValues: pick(data, changedFields),
                  },
                  ...requestContext,
                },
                tx,
              );
              return updated;
            })
          : await update(this.prisma);

      return toHospitalItem(hospital as SelectedHospital);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Nie znaleziono szpitala.');
      }

      throw new InternalServerErrorException(
        'Nie udało się zaktualizować szpitala.',
      );
    }
  }
}

function pick(
  source: Record<string, unknown>,
  fields: string[],
): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, source[field]]));
}

function toHospitalItem(hospital: SelectedHospital): HospitalItem {
  return {
    id: hospital.id,
    name: hospital.name,
    active: hospital.active,
    portalEnabled: hospital.portalEnabled,
    departmentsCount: hospital._count.departments,
    membershipsCount: hospital._count.memberships,
    createdAt: hospital.createdAt,
    updatedAt: hospital.updatedAt,
  };
}

function parseCreateBody(body: unknown): { name: string } {
  const record = requireRecord(body);
  rejectUnknownFields(record, ['name']);

  return { name: parseName(record.name) };
}

function parseUpdateBody(
  body: unknown,
): {
  name?: string;
  active?: boolean;
  portalEnabled?: boolean;
} {
  const record = requireRecord(body);
  rejectUnknownFields(record, ['name', 'active', 'portalEnabled']);

  if (Object.keys(record).length === 0) {
    throw new BadRequestException(
      'Podaj co najmniej jedno pole do aktualizacji.',
    );
  }

  const data: {
    name?: string;
    active?: boolean;
    portalEnabled?: boolean;
  } = {};

  if ('name' in record) {
    data.name = parseName(record.name);
  }

  if ('active' in record) {
    data.active = parseBodyBoolean(record.active, 'active');
  }

  if ('portalEnabled' in record) {
    data.portalEnabled = parseBodyBoolean(
      record.portalEnabled,
      'portalEnabled',
    );
  }

  return data;
}

function parseName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('Nazwa szpitala jest wymagana.');
  }

  const name = value.trim();

  if (name.length < 3) {
    throw new BadRequestException(
      'Nazwa szpitala musi mieć co najmniej 3 znaki.',
    );
  }

  if (name.length > 200) {
    throw new BadRequestException(
      'Nazwa szpitala może mieć maksymalnie 200 znaków.',
    );
  }

  return name;
}

function parseBodyBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new BadRequestException(
      `Pole ${field} musi mieć wartość true albo false.`,
    );
  }

  return value;
}

function parseOptionalBoolean(
  value: string | undefined,
  field: string,
): boolean | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new BadRequestException(
    `Parametr ${field} musi mieć wartość true albo false.`,
  );
}

function parsePositiveInteger(
  value: string | undefined,
  field: string,
  defaultValue: number,
  maximum?: number,
): number {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  if (!/^\d+$/.test(value)) {
    throw new BadRequestException(
      `Parametr ${field} musi być dodatnią liczbą całkowitą.`,
    );
  }

  const number = Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < 1 ||
    (maximum !== undefined && number > maximum)
  ) {
    throw new BadRequestException(
      `Parametr ${field} ma nieprawidłową wartość.`,
    );
  }

  return number;
}

function requireRecord(body: unknown): Record<string, unknown> {
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body)
  ) {
    throw new BadRequestException(
      'Nieprawidłowy format danych wejściowych.',
    );
  }

  return body as Record<string, unknown>;
}

function rejectUnknownFields(
  record: Record<string, unknown>,
  allowedFields: string[],
): void {
  if (Object.keys(record).some((key) => !allowedFields.includes(key))) {
    throw new BadRequestException(
      'Dane zawierają niedozwolone pola.',
    );
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
