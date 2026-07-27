import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { EmmaAdminGuard } from '../src/admin-hospitals/emma-admin.guard';
import { AuditService, sanitizeMetadata } from '../src/audit/audit.service';
import { AuthService } from '../src/auth/auth.service';
import { hashPassword } from '../src/auth/password';
import type { AuditService as AuditServiceType } from '../src/audit/audit.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { PortalHospitalsService } from '../src/portal-hospitals/portal-hospitals.service';
import type { CurrentHospitalScope } from '../src/portal-hospitals/current-hospital-scope.service';
import { AdminUsersService } from '../src/admin-users/admin-users.service';

describe('Audit module', () => {
  it('removes passwords, tokens, cookies, authorization and secrets recursively', () => {
    const metadata = sanitizeMetadata({
      changedFields: ['status'],
      password: 'no',
      temporaryPassword: 'no',
      nested: {
        tokenHash: 'no',
        Authorization: 'no',
        apiKey: 'no',
        safe: true,
      },
    });

    expect(metadata).toEqual({
      changedFields: ['status'],
      nested: { safe: true },
    });
    expect(JSON.stringify(metadata)).not.toMatch(
      /password|token|authorization|apiKey/i,
    );
  });

  it('creates SUCCESS audit event after a successful login', async () => {
    const passwordHash = await hashPassword('correct-password');
    const auditRecord = jest.fn().mockReturnValue('audit-query');
    const prisma = authPrisma({
      id: 'user-id',
      email: 'user@example.com',
      passwordHash,
      status: 'ACTIVE',
      systemRole: 'EMMA_ADMIN',
      deletedAt: null,
      memberships: [],
    });
    const service = new AuthService(
      prisma as unknown as PrismaService,
      { record: auditRecord } as unknown as AuditServiceType,
    );

    await service.login('user@example.com', 'correct-password', {
      requestId: 'req-1',
    });

    expect(auditRecord).toHaveBeenCalledWith({
      actorId: 'user-id',
      action: 'AUTH_LOGIN_SUCCEEDED',
      outcome: 'SUCCESS',
      requestId: 'req-1',
    });
  });

  it('creates FAILURE with masked email and no password after a failed login', async () => {
    const auditRecord = jest.fn().mockResolvedValue({});
    const service = new AuthService(
      authPrisma(null) as unknown as PrismaService,
      { record: auditRecord } as unknown as AuditServiceType,
    );

    await expect(
      service.login('person@example.com', 'highly-secret'),
    ).rejects.toMatchObject({ status: 401 });

    expect(auditRecord).toHaveBeenCalledWith({
      action: 'AUTH_LOGIN_FAILED',
      outcome: 'FAILURE',
      metadata: { email: 'p***@example.com' },
    });
    expect(JSON.stringify(auditRecord.mock.calls)).not.toContain(
      'highly-secret',
    );
  });

  it('allows EMMA_ADMIN and denies USER', () => {
    const guard = new EmmaAdminGuard();
    expect(
      guard.canActivate(
        contextFor({ systemRole: 'EMMA_ADMIN' }),
      ),
    ).toBe(true);
    expect(() =>
      guard.canActivate(
        contextFor({ systemRole: 'USER' }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('applies filters, totalCount, pagination and newest-first ordering', async () => {
    const findMany = jest.fn().mockReturnValue('find-query');
    const count = jest.fn().mockReturnValue('count-query');
    const transaction = jest.fn().mockResolvedValue([
      [
        {
          id: 'event-2',
          action: 'USER_CREATED',
          outcome: 'SUCCESS',
          actor: null,
          entityType: 'USER',
          entityId: null,
          hospital: null,
          metadata: null,
          ipAddress: null,
          userAgent: null,
          requestId: 'req-2',
          createdAt: new Date('2026-07-27T12:00:00Z'),
        },
      ],
      12,
    ]);
    const service = new AuditService({
      auditEvent: { findMany, count },
      $transaction: transaction,
    } as unknown as PrismaService);

    const result = await service.list({
      page: '2',
      pageSize: '5',
      action: 'USER_CREATED',
      outcome: 'SUCCESS',
      actorId: '5a9789a5-8899-49f0-86cf-456a703a64a1',
      dateFrom: '2026-07-01',
    });

    expect(result.totalCount).toBe(12);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: 'USER_CREATED',
          outcome: 'SUCCESS',
          actorId: '5a9789a5-8899-49f0-86cf-456a703a64a1',
        }),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 5,
        take: 5,
      }),
    );
  });

  it('records an active hospital change in the update transaction', async () => {
    const auditRecord = jest.fn().mockResolvedValue({});
    const tx = {
      userSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      membership: {
        findMany: jest.fn().mockResolvedValue([
          {
            role: 'HOSPITAL_USER',
            hospital: { id: hospitalId, name: 'Szpital Testowy' },
          },
        ]),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = new PortalHospitalsService(
      prisma as unknown as PrismaService,
      {} as CurrentHospitalScope,
      { record: auditRecord } as unknown as AuditServiceType,
    );

    await service.setActiveHospital(
      userId,
      sessionId,
      { hospitalId },
      { requestId: 'req-switch' },
    );

    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: userId,
        action: 'ACTIVE_HOSPITAL_CHANGED',
        entityId: hospitalId,
        hospitalId,
      }),
      tx,
    );
  });

  it('records user creation without the temporary password', async () => {
    const auditRecord = jest.fn().mockResolvedValue({});
    const selectedUser = {
      id: userId,
      email: 'user@example.com',
      status: 'ACTIVE',
      systemRole: 'USER',
      lastLoginAt: null,
      createdAt: new Date(),
      memberships: [
        {
          id: membershipId,
          hospitalId,
          departmentId: null,
          role: 'HOSPITAL_USER',
          hospital: { name: 'Szpital Testowy' },
        },
      ],
    };
    const tx = {
      user: { create: jest.fn().mockResolvedValue(selectedUser) },
    };
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      hospital: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: hospitalId, active: true }),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = new AdminUsersService(
      prisma as unknown as PrismaService,
      { record: auditRecord } as unknown as AuditServiceType,
    );

    await service.create(
      {
        email: 'user@example.com',
        temporaryPassword: 'temporary-password',
        hospitalId,
        membershipRole: 'HOSPITAL_USER',
      },
      adminId,
    );

    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: adminId,
        action: 'USER_CREATED',
        entityId: userId,
      }),
      tx,
    );
    expect(JSON.stringify(auditRecord.mock.calls)).not.toContain(
      'temporary-password',
    );
  });

  it('records membership deletion in the same transaction', async () => {
    const auditRecord = jest.fn().mockResolvedValue({});
    const tx = {
      membership: {
        findFirst: jest.fn().mockResolvedValue({
          hospitalId,
          role: 'HOSPITAL_USER',
        }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = new AdminUsersService(
      prisma as unknown as PrismaService,
      { record: auditRecord } as unknown as AuditServiceType,
    );

    await service.deleteMembership(
      userId,
      membershipId,
      adminId,
    );

    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MEMBERSHIP_DELETED',
        entityId: membershipId,
        hospitalId,
      }),
      tx,
    );
  });
});

const adminId = '5a9789a5-8899-49f0-86cf-456a703a64a1';
const userId = '7c6e2bde-0c72-4d84-a967-1e74ed79b439';
const hospitalId = '348f0785-8427-4d33-97ee-61cae8e91e42';
const membershipId = '923ddfe7-b71e-4aec-86a5-90478e11ed05';
const sessionId = '0ea8b102-bb01-42da-8900-cc19586e9e68';

function authPrisma(user: unknown) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockReturnValue('user-update'),
    },
    userSession: {
      create: jest.fn().mockReturnValue('session-create'),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
}

function contextFor(user: object): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ currentUser: user }),
    }),
  } as unknown as ExecutionContext;
}
