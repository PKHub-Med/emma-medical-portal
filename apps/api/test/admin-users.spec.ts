import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { EmmaAdminGuard } from '../src/admin-hospitals/emma-admin.guard';
import { AdminUsersController } from '../src/admin-users/admin-users.controller';
import { AdminUsersService } from '../src/admin-users/admin-users.service';
import { SESSION_COOKIE_NAME } from '../src/auth/auth.constants';
import type { AuthenticatedRequest } from '../src/auth/authenticated-request';
import { AuthService } from '../src/auth/auth.service';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { verifyPassword } from '../src/auth/password';
import { SessionAuthGuard } from '../src/auth/session-auth.guard';
import { PrismaService } from '../src/prisma/prisma.service';

const admin: AuthenticatedUser = {
  id: '5a9789a5-8899-49f0-86cf-456a703a64a1',
  email: 'admin@example.com',
  status: 'ACTIVE',
  systemRole: 'EMMA_ADMIN',
  memberships: [],
};

const regularUser: AuthenticatedUser = {
  ...admin,
  id: '7c6e2bde-0c72-4d84-a967-1e74ed79b439',
  email: 'user@example.com',
  systemRole: 'USER',
};

const hospitalId = '348f0785-8427-4d33-97ee-61cae8e91e42';
const secondHospitalId = '0ea8b102-bb01-42da-8900-cc19586e9e68';
const membershipId = '923ddfe7-b71e-4aec-86a5-90478e11ed05';
const now = new Date('2026-07-27T12:00:00.000Z');

const selectedMembership = {
  id: membershipId,
  hospitalId,
  departmentId: null,
  role: 'HOSPITAL_USER',
  hospital: { name: 'Szpital Testowy' },
};

const selectedUser = {
  id: regularUser.id,
  email: regularUser.email,
  status: 'ACTIVE',
  systemRole: 'USER',
  lastLoginAt: null,
  createdAt: now,
  memberships: [selectedMembership],
};

describe('Admin users and access', () => {
  const userFindMany = jest.fn();
  const userCount = jest.fn();
  const userFindFirst = jest.fn();
  const userFindUnique = jest.fn();
  const userCreate = jest.fn();
  const userUpdate = jest.fn();
  const hospitalFindUnique = jest.fn();
  const membershipFindFirst = jest.fn();
  const membershipCreate = jest.fn();
  const membershipUpdate = jest.fn();
  const membershipDeleteMany = jest.fn();
  const sessionUpdateMany = jest.fn();
  const transaction = jest.fn();
  const prismaMock = {
    user: {
      findMany: userFindMany,
      count: userCount,
      findFirst: userFindFirst,
      findUnique: userFindUnique,
      create: userCreate,
      update: userUpdate,
    },
    hospital: {
      findUnique: hospitalFindUnique,
    },
    membership: {
      findFirst: membershipFindFirst,
      create: membershipCreate,
      update: membershipUpdate,
      deleteMany: membershipDeleteMany,
    },
    userSession: {
      updateMany: sessionUpdateMany,
    },
    $transaction: transaction,
  };

  let service: AdminUsersService;
  let controller: AdminUsersController;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminUsersService(
      prismaMock as unknown as PrismaService,
    );
    controller = new AdminUsersController(service);
  });

  it('allows EMMA_ADMIN to get users with totalCount', async () => {
    const guard = new EmmaAdminGuard();
    userFindMany.mockReturnValue('users-query');
    userCount.mockReturnValue('count-query');
    transaction.mockResolvedValue([[selectedUser], 31]);

    expect(guard.canActivate(contextFor(requestFor(admin)))).toBe(true);
    await expect(
      controller.list({ page: '2', pageSize: '25' }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: regularUser.id,
          email: regularUser.email,
          memberships: [
            {
              id: membershipId,
              hospitalId,
              hospitalName: 'Szpital Testowy',
              departmentId: null,
              role: 'HOSPITAL_USER',
            },
          ],
        }),
      ],
      page: 2,
      pageSize: 25,
      totalCount: 31,
    });
    expect(userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
        skip: 25,
        take: 25,
      }),
    );
  });

  it('can include logically deleted users only when explicitly requested', async () => {
    userFindMany.mockReturnValue('users-query');
    userCount.mockReturnValue('count-query');
    transaction.mockResolvedValue([[selectedUser], 1]);

    await controller.list({ includeDeleted: 'true' });

    expect(userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('returns 403 to USER', () => {
    const guard = new EmmaAdminGuard();

    expect(() =>
      guard.canActivate(contextFor(requestFor(regularUser))),
    ).toThrow(ForbiddenException);
  });

  it('returns 401 when there is no session', async () => {
    const guard = new SessionAuthGuard({
      getAuthenticatedUser: jest.fn(),
    } as unknown as AuthService);

    await expect(
      guard.canActivate(
        contextFor({ headers: {} } as AuthenticatedRequest),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('normalizes email, hashes the password and creates null department access', async () => {
    userFindFirst.mockResolvedValue(null);
    hospitalFindUnique.mockResolvedValue({
      id: hospitalId,
      active: true,
    });
    userCreate.mockImplementation(async ({ data }) => ({
      ...selectedUser,
      email: data.email,
      memberships: [selectedMembership],
    }));

    const result = await controller.create({
      email: '  USER@Example.COM  ',
      temporaryPassword: 'temporary-password',
      hospitalId,
      membershipRole: 'HOSPITAL_USER',
    });

    const createData = userCreate.mock.calls[0][0].data;
    expect(createData).toMatchObject({
      email: 'user@example.com',
      status: 'ACTIVE',
      systemRole: 'USER',
      memberships: {
        create: {
          hospitalId,
          departmentId: null,
          role: 'HOSPITAL_USER',
        },
      },
    });
    expect(createData.passwordHash).not.toBe('temporary-password');
    await expect(
      verifyPassword(createData.passwordHash, 'temporary-password'),
    ).resolves.toBe(true);
    expect(JSON.stringify(result)).not.toContain('temporary-password');
    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });

  it('blocks duplicate email regardless of letter case', async () => {
    userFindFirst.mockResolvedValue({ id: regularUser.id });

    await expect(
      controller.create({
        email: 'USER@EXAMPLE.COM',
        temporaryPassword: 'temporary-password',
        hospitalId,
        membershipRole: 'HOSPITAL_USER',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(userFindFirst).toHaveBeenCalledWith({
      where: {
        email: {
          equals: 'user@example.com',
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('allows access to two different hospitals with departmentId=null', async () => {
    userFindUnique.mockResolvedValue({ id: regularUser.id });
    hospitalFindUnique.mockImplementation(async ({ where }) => ({
      id: where.id,
      active: true,
    }));
    membershipFindFirst.mockResolvedValue(null);
    membershipCreate.mockImplementation(async ({ data }) => ({
      id:
        data.hospitalId === hospitalId
          ? membershipId
          : '31355456-025c-44ae-b5c0-97945a71db9f',
      ...data,
      hospital: {
        name:
          data.hospitalId === hospitalId
            ? 'Szpital Testowy'
            : 'Drugi Szpital',
      },
    }));

    await controller.addMembership(regularUser.id, {
      hospitalId,
      role: 'HOSPITAL_USER',
    });
    await controller.addMembership(regularUser.id, {
      hospitalId: secondHospitalId,
      role: 'HOSPITAL_ADMIN',
    });

    expect(membershipCreate).toHaveBeenCalledTimes(2);
    expect(membershipCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          hospitalId,
          departmentId: null,
        }),
      }),
    );
    expect(membershipCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          hospitalId: secondHospitalId,
          departmentId: null,
        }),
      }),
    );
  });

  it('blocks a duplicate membership', async () => {
    userFindUnique.mockResolvedValue({ id: regularUser.id });
    hospitalFindUnique.mockResolvedValue({
      id: hospitalId,
      active: true,
    });
    membershipFindFirst.mockResolvedValue({ id: membershipId });

    await expect(
      controller.addMembership(regularUser.id, {
        hospitalId,
        role: 'HOSPITAL_USER',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(membershipCreate).not.toHaveBeenCalled();
  });

  it('revokes active sessions when status changes to BLOCKED', async () => {
    userFindUnique.mockResolvedValue({ id: regularUser.id });
    userUpdate.mockReturnValue('user-update-query');
    sessionUpdateMany.mockReturnValue('session-update-query');
    transaction.mockResolvedValue([
      { ...selectedUser, status: 'BLOCKED' },
      { count: 2 },
    ]);

    await expect(
      controller.updateStatus(
        regularUser.id,
        { status: 'BLOCKED' },
        requestFor(admin),
      ),
    ).resolves.toMatchObject({ status: 'BLOCKED' });
    expect(sessionUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: regularUser.id,
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });
  });

  it('does not allow the administrator to block their own account', async () => {
    await expect(
      controller.updateStatus(
        admin.id,
        { status: 'BLOCKED' },
        requestFor(admin),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(userUpdate).not.toHaveBeenCalled();
    expect(sessionUpdateMany).not.toHaveBeenCalled();
  });

  it('soft deletes a regular user, revokes sessions and removes memberships', async () => {
    userFindUnique.mockResolvedValue({
      id: regularUser.id,
      systemRole: 'USER',
      deletedAt: null,
    });
    userUpdate.mockReturnValue('user-soft-delete-query');
    sessionUpdateMany.mockReturnValue('session-revoke-query');
    membershipDeleteMany.mockReturnValue('memberships-delete-query');
    transaction.mockResolvedValue([
      { id: regularUser.id },
      { count: 2 },
      { count: 3 },
    ]);

    await expect(
      controller.deleteUser(regularUser.id, requestFor(admin)),
    ).resolves.toBeUndefined();

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: regularUser.id },
      data: {
        status: 'INACTIVE',
        deletedAt: expect.any(Date),
        deletedByUserId: admin.id,
      },
      select: { id: true },
    });
    expect(sessionUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: regularUser.id,
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { revokedAt: expect.any(Date) },
    });
    expect(membershipDeleteMany).toHaveBeenCalledWith({
      where: { userId: regularUser.id },
    });
    expect(transaction).toHaveBeenCalledWith([
      'user-soft-delete-query',
      'session-revoke-query',
      'memberships-delete-query',
    ]);
    expect(prismaMock.user).not.toHaveProperty('delete');
  });

  it('does not allow the administrator to delete their own account', async () => {
    await expect(
      controller.deleteUser(admin.id, requestFor(admin)),
    ).rejects.toMatchObject({ status: 403 });

    expect(userFindUnique).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('does not allow deleting privileged system accounts', async () => {
    userFindUnique.mockResolvedValue({
      id: regularUser.id,
      systemRole: 'SERVICE_OPERATOR',
      deletedAt: null,
    });

    await expect(
      controller.deleteUser(regularUser.id, requestFor(admin)),
    ).rejects.toMatchObject({ status: 403 });

    expect(transaction).not.toHaveBeenCalled();
  });

  it('updates only a membership belonging to the specified user', async () => {
    membershipFindFirst.mockResolvedValue({ id: membershipId });
    membershipUpdate.mockResolvedValue({
      ...selectedMembership,
      role: 'HOSPITAL_ADMIN',
    });

    await expect(
      controller.updateMembership(
        regularUser.id,
        membershipId,
        { role: 'HOSPITAL_ADMIN' },
      ),
    ).resolves.toMatchObject({
      id: membershipId,
      role: 'HOSPITAL_ADMIN',
    });
    expect(membershipFindFirst).toHaveBeenCalledWith({
      where: {
        id: membershipId,
        userId: regularUser.id,
      },
      select: { id: true },
    });
  });

  it('deletes only a membership belonging to the specified user', async () => {
    membershipDeleteMany.mockResolvedValue({ count: 1 });

    await expect(
      controller.deleteMembership(regularUser.id, membershipId),
    ).resolves.toBeUndefined();
    expect(membershipDeleteMany).toHaveBeenCalledWith({
      where: {
        id: membershipId,
        userId: regularUser.id,
      },
    });
  });
});

function requestFor(user: AuthenticatedUser): AuthenticatedRequest {
  return {
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=session-token`,
    },
    currentUser: user,
  } as AuthenticatedRequest;
}

function contextFor(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}
