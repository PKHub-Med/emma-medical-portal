import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminHospitalsController } from '../src/admin-hospitals/admin-hospitals.controller';
import { AdminHospitalsService } from '../src/admin-hospitals/admin-hospitals.service';
import { EmmaAdminGuard } from '../src/admin-hospitals/emma-admin.guard';
import { SESSION_COOKIE_NAME } from '../src/auth/auth.constants';
import type { AuthenticatedRequest } from '../src/auth/authenticated-request';
import { AuthService } from '../src/auth/auth.service';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { SessionAuthGuard } from '../src/auth/session-auth.guard';
import { PrismaService } from '../src/prisma/prisma.service';

const admin: AuthenticatedUser = {
  id: 'admin-id',
  email: 'admin@example.com',
  status: 'ACTIVE',
  systemRole: 'EMMA_ADMIN',
  memberships: [],
};

const regularUser: AuthenticatedUser = {
  ...admin,
  id: 'user-id',
  email: 'user@example.com',
  systemRole: 'USER',
};

const now = new Date('2026-07-27T12:00:00.000Z');
const hospital = {
  id: '348f0785-8427-4d33-97ee-61cae8e91e42',
  name: 'Szpital Miejski',
  active: true,
  portalEnabled: false,
  createdAt: now,
  updatedAt: now,
  _count: {
    departments: 2,
    memberships: 5,
  },
};

describe('Admin hospitals', () => {
  const findMany = jest.fn();
  const count = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const transaction = jest.fn();
  const prismaMock = {
    hospital: {
      findMany,
      count,
      create,
      update,
    },
    $transaction: transaction,
  };

  let service: AdminHospitalsService;
  let controller: AdminHospitalsController;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminHospitalsService(
      prismaMock as unknown as PrismaService,
    );
    controller = new AdminHospitalsController(service);
  });

  it('allows EMMA_ADMIN to get the hospitals list', async () => {
    const guard = new EmmaAdminGuard();
    const request = requestFor(admin);
    findMany.mockReturnValue('find-many-query');
    count.mockReturnValue('count-query');
    transaction.mockResolvedValue([[hospital], 1]);

    expect(guard.canActivate(contextFor(request))).toBe(true);
    await expect(controller.list({})).resolves.toMatchObject({
      items: [
        {
          id: hospital.id,
          name: hospital.name,
          departmentsCount: 2,
          membershipsCount: 5,
        },
      ],
      page: 1,
      pageSize: 25,
      totalCount: 1,
    });
  });

  it('returns 403 to USER', () => {
    const guard = new EmmaAdminGuard();

    expect(() =>
      guard.canActivate(contextFor(requestFor(regularUser))),
    ).toThrow(ForbiddenException);
  });

  it('returns 401 when there is no session', async () => {
    const authServiceMock = {
      getAuthenticatedUser: jest.fn(),
    };
    const guard = new SessionAuthGuard(
      authServiceMock as unknown as AuthService,
    );
    const request = { headers: {} } as AuthenticatedRequest;

    await expect(
      guard.canActivate(contextFor(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('creates a hospital with portalEnabled=false', async () => {
    create.mockResolvedValue(hospital);

    await expect(
      controller.create({ name: '  Szpital Miejski  ' }),
    ).resolves.toMatchObject({
      name: 'Szpital Miejski',
      active: true,
      portalEnabled: false,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: 'Szpital Miejski',
          active: true,
          portalEnabled: false,
        },
      }),
    );
  });

  it('updates active and portalEnabled', async () => {
    update.mockResolvedValue({
      ...hospital,
      active: false,
      portalEnabled: true,
    });

    await expect(
      controller.update(hospital.id, {
        active: false,
        portalEnabled: true,
      }),
    ).resolves.toMatchObject({
      active: false,
      portalEnabled: true,
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: hospital.id },
        data: {
          active: false,
          portalEnabled: true,
        },
      }),
    );
  });

  it('returns totalCount independently of the current page', async () => {
    findMany.mockReturnValue('find-many-query');
    count.mockReturnValue('count-query');
    transaction.mockResolvedValue([[hospital], 52]);

    await expect(
      controller.list({ page: '2', pageSize: '25' }),
    ).resolves.toMatchObject({
      page: 2,
      pageSize: 25,
      totalCount: 52,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 25,
        take: 25,
      }),
    );
  });

  it('validates and trims hospital names safely', async () => {
    await expect(controller.create({ name: '  ' })).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      controller.create({ name: 'ab' }),
    ).rejects.toMatchObject({ status: 400 });

    create.mockRejectedValue(
      new Error('postgresql://secret:password@database/internal'),
    );
    await expect(
      controller.create({ name: 'Nowy szpital' }),
    ).rejects.toMatchObject({
      status: 500,
      response: {
        message: 'Nie udało się utworzyć szpitala.',
      },
    });
  });
});

function requestFor(
  user: AuthenticatedUser,
): AuthenticatedRequest {
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
