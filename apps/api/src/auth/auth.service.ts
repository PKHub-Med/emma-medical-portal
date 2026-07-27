import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { SystemRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  INVALID_CREDENTIALS_MESSAGE,
  SESSION_TTL_MS,
} from './auth.constants';
import { hashPassword, verifyPassword } from './password';
import type {
  AuthenticatedContext,
  AuthenticatedUser,
} from './auth.types';

@Injectable()
export class AuthService {
  private readonly fallbackPasswordHash = hashPassword(
    randomBytes(32).toString('base64url'),
  );

  constructor(private readonly prisma: PrismaService) {}

  async login(emailValue: unknown, passwordValue: unknown): Promise<string> {
    const email =
      typeof emailValue === 'string' ? emailValue.trim().toLowerCase() : '';
    const password = typeof passwordValue === 'string' ? passwordValue : '';

    const [user, dummyPasswordHash] = await Promise.all([
      email
        ? this.prisma.user.findUnique({
            where: { email },
            include: {
              memberships: {
                where: {
                  departmentId: null,
                  hospital: {
                    active: true,
                    portalEnabled: true,
                  },
                },
                select: { hospitalId: true },
                orderBy: { hospital: { name: 'asc' } },
                take: 1,
              },
            },
          })
        : Promise.resolve(null),
      this.fallbackPasswordHash,
    ]);

    const passwordMatches = await verifyPassword(
      user?.passwordHash ?? dummyPasswordHash,
      password,
    );

    if (!user || !passwordMatches || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    const activeHospitalId =
      user.systemRole === SystemRole.USER
        ? (user.memberships[0]?.hospitalId ?? null)
        : null;

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now },
      }),
      this.prisma.userSession.create({
        data: {
          userId: user.id,
          tokenHash,
          activeHospitalId,
          expiresAt,
        },
      }),
    ]);

    return token;
  }

  async getAuthenticatedContext(
    token: string,
  ): Promise<AuthenticatedContext> {
    const now = new Date();
    const session = await this.prisma.userSession.findUnique({
      where: {
        tokenHash: this.hashToken(token),
      },
      include: {
        user: {
          include: {
            memberships: {
              include: {
                hospital: {
                  select: {
                        name: true,
                        active: true,
                        portalEnabled: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException();
    }

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { lastUsedAt: now },
    });

    const activeMembership =
      session.user.systemRole === SystemRole.USER
        ? session.user.memberships
            .filter(
              (membership) =>
                membership.hospitalId === session.activeHospitalId &&
                membership.departmentId === null &&
                membership.hospital.active &&
                membership.hospital.portalEnabled,
            )
            .sort((left, right) =>
              left.role === right.role
                ? 0
                : left.role === 'HOSPITAL_ADMIN'
                  ? -1
                  : 1,
            )[0]
        : undefined;

    const user: AuthenticatedUser = {
      id: session.user.id,
      email: session.user.email,
      status: session.user.status,
      systemRole: session.user.systemRole,
      memberships: session.user.memberships.map((membership) => ({
        hospitalId: membership.hospitalId,
        hospitalName: membership.hospital.name,
        departmentId: membership.departmentId,
        role: membership.role,
      })),
    };

    if (session.user.systemRole === SystemRole.USER) {
      user.activeHospital = activeMembership
        ? {
            id: activeMembership.hospitalId,
            name: activeMembership.hospital.name,
            role: activeMembership.role,
          }
        : null;
    }

    return {
      user,
      sessionId: session.id,
    };
  }

  async getAuthenticatedUser(token: string): Promise<AuthenticatedUser> {
    return (await this.getAuthenticatedContext(token)).user;
  }

  async revokeSession(token: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: {
        tokenHash: this.hashToken(token),
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
