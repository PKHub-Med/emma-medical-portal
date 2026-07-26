import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  INVALID_CREDENTIALS_MESSAGE,
  SESSION_TTL_MS,
} from './auth.constants';
import type { AuthenticatedUser } from './auth.types';
import { hashPassword, verifyPassword } from './password';

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

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now },
      }),
      this.prisma.userSession.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      }),
    ]);

    return token;
  }

  async getAuthenticatedUser(token: string): Promise<AuthenticatedUser> {
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

    return {
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
