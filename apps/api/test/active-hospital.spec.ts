import { ForbiddenException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AuthenticatedRequest } from '../src/auth/authenticated-request';
import { CurrentHospitalScope } from '../src/portal-hospitals/current-hospital-scope.service';
import { PortalHospitalsController } from '../src/portal-hospitals/portal-hospitals.controller';
import { PortalHospitalsService } from '../src/portal-hospitals/portal-hospitals.service';
import { PrismaService } from '../src/prisma/prisma.service';

const userId = '7c6e2bde-0c72-4d84-a967-1e74ed79b439';
const sessionId = '923ddfe7-b71e-4aec-86a5-90478e11ed05';
const firstHospitalId = '348f0785-8427-4d33-97ee-61cae8e91e42';
const secondHospitalId = '0ea8b102-bb01-42da-8900-cc19586e9e68';

const firstMembership = {
  role: 'HOSPITAL_USER',
  hospital: {
    id: firstHospitalId,
    name: 'Szpital Miejski',
  },
};

const secondMembership = {
  role: 'HOSPITAL_ADMIN',
  hospital: {
    id: secondHospitalId,
    name: 'Szpital Specjalistyczny',
  },
};

describe('Active hospital session scope', () => {
  const membershipFindMany = jest.fn();
  const sessionFindFirst = jest.fn();
  const sessionUpdateMany = jest.fn();
  const prismaMock = {
    membership: { findMany: membershipFindMany },
    userSession: {
      findFirst: sessionFindFirst,
      updateMany: sessionUpdateMany,
    },
  };

  let scope: CurrentHospitalScope;
  let service: PortalHospitalsService;
  let controller: PortalHospitalsController;

  beforeEach(() => {
    jest.clearAllMocks();
    scope = new CurrentHospitalScope(
      prismaMock as unknown as PrismaService,
    );
    service = new PortalHospitalsService(
      prismaMock as unknown as PrismaService,
      scope,
    );
    controller = new PortalHospitalsController(service);
  });

  it('adds the nullable activeHospitalId relation and migration', () => {
    const schema = readFileSync(
      resolve('prisma/schema.prisma'),
      'utf8',
    );
    const migration = readFileSync(
      resolve(
        'prisma/migrations/20260727010000_add_active_hospital_to_session/migration.sql',
      ),
      'utf8',
    );

    expect(schema).toMatch(
      /activeHospitalId\s+String\?\s+@map\("active_hospital_id"\)/,
    );
    expect(migration).toContain(
      'ADD COLUMN "active_hospital_id" UUID',
    );
    expect(migration).toContain('ON DELETE SET NULL');
  });

  it('returns only available hospital-wide memberships', async () => {
    membershipFindMany.mockResolvedValue([
      firstMembership,
      secondMembership,
    ]);
    sessionFindFirst.mockResolvedValue({
      activeHospitalId: firstHospitalId,
    });

    await expect(controller.list(request())).resolves.toEqual({
      items: [
        {
          id: firstHospitalId,
          name: 'Szpital Miejski',
          role: 'HOSPITAL_USER',
        },
        {
          id: secondHospitalId,
          name: 'Szpital Specjalistyczny',
          role: 'HOSPITAL_ADMIN',
        },
      ],
      activeHospitalId: firstHospitalId,
    });
    expect(membershipFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId,
          departmentId: null,
          hospital: {
            active: true,
            portalEnabled: true,
          },
        },
      }),
    );
  });

  it('switches between two memberships only for the current session', async () => {
    membershipFindMany.mockResolvedValue([secondMembership]);
    sessionUpdateMany.mockResolvedValue({ count: 1 });

    await expect(
      controller.setActiveHospital(request(), {
        hospitalId: secondHospitalId,
      }),
    ).resolves.toEqual({
      id: secondHospitalId,
      name: 'Szpital Specjalistyczny',
      role: 'HOSPITAL_ADMIN',
    });
    expect(sessionUpdateMany).toHaveBeenCalledWith({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { activeHospitalId: secondHospitalId },
    });
  });

  it('does not allow selecting a hospital without membership', async () => {
    membershipFindMany.mockResolvedValue([]);

    await expect(
      controller.setActiveHospital(request(), {
        hospitalId: secondHospitalId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(sessionUpdateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['inactive hospital', { active: true, portalEnabled: true }],
    ['hospital with disabled portal', { active: true, portalEnabled: true }],
  ])(
    'does not expose an %s because both availability flags are required',
    async (_label, requiredHospitalState) => {
      membershipFindMany.mockResolvedValue([]);
      sessionFindFirst.mockResolvedValue({
        activeHospitalId: firstHospitalId,
      });

      await expect(controller.list(request())).resolves.toEqual({
        items: [],
        activeHospitalId: null,
      });
      expect(membershipFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            hospital: requiredHospitalState,
          }),
        }),
      );
    },
  );

  it('revalidates membership and hospital state in CurrentHospitalScope', async () => {
    sessionFindFirst.mockResolvedValue({
      activeHospitalId: firstHospitalId,
    });
    membershipFindMany.mockResolvedValue([]);

    await expect(
      scope.resolve(userId, sessionId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(membershipFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId,
          hospitalId: firstHospitalId,
          departmentId: null,
          hospital: {
            active: true,
            portalEnabled: true,
          },
        },
      }),
    );
  });
});

function request(): AuthenticatedRequest {
  return {
    headers: {},
    currentSessionId: sessionId,
    currentUser: {
      id: userId,
      email: 'user@example.com',
      status: 'ACTIVE',
      systemRole: 'USER',
      memberships: [],
      activeHospital: null,
    },
  } as unknown as AuthenticatedRequest;
}
