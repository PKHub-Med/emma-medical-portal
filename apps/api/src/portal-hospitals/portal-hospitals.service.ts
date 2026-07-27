import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { MembershipRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  CurrentHospitalScope,
  preferHospitalAdmin,
  type CurrentHospital,
} from './current-hospital-scope.service';

export interface AvailableHospitalsResponse {
  items: CurrentHospital[];
  activeHospitalId: string | null;
}

type AvailableMembership = {
  role: MembershipRole;
  hospital: {
    id: string;
    name: string;
  };
};

@Injectable()
export class PortalHospitalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentHospitalScope: CurrentHospitalScope,
  ) {}

  async list(
    userId: string,
    sessionId: string,
  ): Promise<AvailableHospitalsResponse> {
    const [memberships, session] = await Promise.all([
      this.findAvailableMemberships(userId),
      this.prisma.userSession.findFirst({
        where: {
          id: sessionId,
          userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { activeHospitalId: true },
      }),
    ]);

    if (!session) {
      throw new UnauthorizedException();
    }

    const items = uniqueHospitals(memberships);
    const activeHospitalId = items.some(
      (hospital) => hospital.id === session.activeHospitalId,
    )
      ? session.activeHospitalId
      : null;

    return { items, activeHospitalId };
  }

  async setActiveHospital(
    userId: string,
    sessionId: string,
    body: unknown,
  ): Promise<CurrentHospital> {
    const hospitalId = parseHospitalId(body);
    const memberships = await this.prisma.membership.findMany({
      where: {
        userId,
        hospitalId,
        departmentId: null,
        hospital: {
          active: true,
          portalEnabled: true,
        },
      },
      select: {
        role: true,
        hospital: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    const membership = preferHospitalAdmin(memberships);

    if (!membership) {
      throw new ForbiddenException(
        'Nie można wybrać wskazanego szpitala.',
      );
    }

    const result = await this.prisma.userSession.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { activeHospitalId: hospitalId },
    });

    if (result.count !== 1) {
      throw new UnauthorizedException();
    }

    return {
      id: membership.hospital.id,
      name: membership.hospital.name,
      role: membership.role,
    };
  }

  resolveCurrentHospital(
    userId: string,
    sessionId: string,
  ): Promise<CurrentHospital> {
    return this.currentHospitalScope.resolve(userId, sessionId);
  }

  private findAvailableMemberships(
    userId: string,
  ): Promise<AvailableMembership[]> {
    return this.prisma.membership.findMany({
      where: {
        userId,
        departmentId: null,
        hospital: {
          active: true,
          portalEnabled: true,
        },
      },
      select: {
        role: true,
        hospital: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { hospital: { name: 'asc' } },
    });
  }
}

function uniqueHospitals(
  memberships: AvailableMembership[],
): CurrentHospital[] {
  const byHospital = new Map<string, AvailableMembership[]>();

  for (const membership of memberships) {
    const existing = byHospital.get(membership.hospital.id) ?? [];
    existing.push(membership);
    byHospital.set(membership.hospital.id, existing);
  }

  return [...byHospital.values()].map((items) => {
    const membership = preferHospitalAdmin(items)!;
    return {
      id: membership.hospital.id,
      name: membership.hospital.name,
      role: membership.role,
    };
  });
}

function parseHospitalId(body: unknown): string {
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body)
  ) {
    throw new BadRequestException(
      'Nieprawidłowy format danych wejściowych.',
    );
  }

  const record = body as Record<string, unknown>;

  if (
    Object.keys(record).length !== 1 ||
    typeof record.hospitalId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      record.hospitalId,
    )
  ) {
    throw new BadRequestException(
      'Identyfikator szpitala jest nieprawidłowy.',
    );
  }

  return record.hospitalId;
}
