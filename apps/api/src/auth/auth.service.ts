import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { AuditOutcome, SystemRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuditRequestContext } from '../audit/audit.types';
import type { Prisma } from '../generated/prisma/client';
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

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  async login(
    emailValue: unknown,
    passwordValue: unknown,
    requestContext: AuditRequestContext = {},
  ): Promise<string> {
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

    if (
      !user ||
      !passwordMatches ||
      user.status !== 'ACTIVE' ||
      user.deletedAt
    ) {
      await this.auditService
        ?.record({
          action: 'AUTH_LOGIN_FAILED',
          outcome: AuditOutcome.FAILURE,
          metadata: { email: maskEmail(email) },
          ...requestContext,
        })
        .catch(() => undefined);
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

    const operations: Prisma.PrismaPromise<unknown>[] = [
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
    ];
    if (this.auditService) {
      operations.push(
        this.auditService.record({
          actorId: user.id,
          action: 'AUTH_LOGIN_SUCCEEDED',
          outcome: AuditOutcome.SUCCESS,
          ...requestContext,
        }),
      );
    }
    await this.prisma.$transaction(operations);

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
      session.user.status !== 'ACTIVE' ||
      session.user.deletedAt
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

  async revokeSessionWithAudit(
    token: string,
    actorId: string,
    requestContext: AuditRequestContext = {},
  ): Promise<void> {
    const revoke = this.prisma.userSession.updateMany({
      where: {
        tokenHash: this.hashToken(token),
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
    if (!this.auditService) {
      await revoke;
      return;
    }
    await this.prisma.$transaction([
      revoke,
      this.auditService.record({
        actorId,
        action: 'AUTH_LOGOUT',
        outcome: AuditOutcome.SUCCESS,
        ...requestContext,
      }),
    ]);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local[0]}***@${domain}`;
}
