import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { MembershipRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

export interface CurrentHospital {
  id: string;
  name: string;
  role: MembershipRole;
}

@Injectable()
export class CurrentHospitalScope {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    userId: string,
    sessionId: string,
  ): Promise<CurrentHospital> {
    const now = new Date();
    const session = await this.prisma.userSession.findFirst({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: { activeHospitalId: true },
    });

    if (!session) {
      throw new UnauthorizedException();
    }

    if (!session.activeHospitalId) {
      throw new ForbiddenException('Brak aktywnego szpitala.');
    }

    const memberships = await this.prisma.membership.findMany({
      where: {
        userId,
        hospitalId: session.activeHospitalId,
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
      throw new ForbiddenException('Brak aktywnego szpitala.');
    }

    return {
      id: membership.hospital.id,
      name: membership.hospital.name,
      role: membership.role,
    };
  }
}

export function preferHospitalAdmin<
  T extends { role: MembershipRole },
>(items: T[]): T | undefined {
  return (
    items.find((item) => item.role === 'HOSPITAL_ADMIN') ?? items[0]
  );
}
