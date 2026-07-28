import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { EmmaAdminGuard } from '../src/admin-hospitals/emma-admin.guard';
import type { AuditService } from '../src/audit/audit.service';
import { SESSION_COOKIE_NAME } from '../src/auth/auth.constants';
import type { AuthenticatedRequest } from '../src/auth/authenticated-request';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { AuthService } from '../src/auth/auth.service';
import { SessionAuthGuard } from '../src/auth/session-auth.guard';
import { StatusMappingSourceEntityType } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';
import { StatusMappingService } from '../src/status-mappings/status-mapping.service';
import { StatusMappingsController } from '../src/status-mappings/status-mappings.controller';

const now = new Date('2026-07-28T12:00:00.000Z');
const mapping = {
  id: '348f0785-8427-4d33-97ee-61cae8e91e42',
  sourceEntityType: StatusMappingSourceEntityType.REPAIR,
  sourceStatus: 'IN_PROGRESS',
  customerStatusCode: 'IN_PROGRESS',
  customerLabel: 'W trakcie naprawy',
  emailTemplateId: null,
  sendEmail: false,
  isTerminal: false,
  requiresAction: false,
  active: true,
  createdAt: now,
  updatedAt: now,
};
const admin: AuthenticatedUser = {
  id: 'admin-id',
  email: 'admin@example.com',
  status: 'ACTIVE',
  systemRole: 'EMMA_ADMIN',
  memberships: [],
};

describe('Status mappings', () => {
  const findMany = jest.fn();
  const count = jest.fn();
  const findFirst = jest.fn();
  const findUnique = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const transaction = jest.fn();
  const prisma = {
    statusMapping: { findMany, count, findFirst, findUnique, create, update },
    $transaction: transaction,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows EMMA_ADMIN to list mappings', async () => {
    const service = new StatusMappingService(prisma as unknown as PrismaService);
    const controller = new StatusMappingsController(service);
    findMany.mockReturnValue('list');
    count.mockReturnValue('count');
    transaction.mockResolvedValue([[mapping], 1]);

    expect(new EmmaAdminGuard().canActivate(contextFor(admin))).toBe(true);
    await expect(controller.list({})).resolves.toMatchObject({
      items: [mapping],
      page: 1,
      pageSize: 25,
      totalCount: 1,
    });
  });

  it('returns 403 to USER and 401 without a session', async () => {
    expect(() =>
      new EmmaAdminGuard().canActivate(
        contextFor({ ...admin, systemRole: 'USER' }),
      ),
    ).toThrow(ForbiddenException);
    const sessionGuard = new SessionAuthGuard({} as AuthService);
    await expect(
      sessionGuard.canActivate({
        switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
      } as ExecutionContext),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('creates a trimmed mapping and uppercases customerStatusCode', async () => {
    const service = new StatusMappingService(prisma as unknown as PrismaService);
    findFirst.mockResolvedValue(null);
    create.mockImplementation(({ data }) => ({ ...mapping, ...data }));

    await expect(
      service.create({
        sourceEntityType: 'REPAIR',
        sourceStatus: '  Naprawa w toku  ',
        customerStatusCode: 'in_progress',
        customerLabel: 'W trakcie naprawy',
      }),
    ).resolves.toMatchObject({
      sourceStatus: 'Naprawa w toku',
      customerStatusCode: 'IN_PROGRESS',
    });
  });

  it('blocks a case-insensitive duplicate for the same entity type', async () => {
    const service = new StatusMappingService(prisma as unknown as PrismaService);
    findFirst.mockResolvedValue({ id: mapping.id });

    await expect(
      service.create({
        sourceEntityType: 'REPAIR',
        sourceStatus: ' in_progress ',
        customerStatusCode: 'IN_PROGRESS',
        customerLabel: 'W toku',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceStatus: { equals: 'in_progress', mode: 'insensitive' },
        }),
      }),
    );
  });

  it('resolves active mappings ignoring case and surrounding spaces', async () => {
    const service = new StatusMappingService(prisma as unknown as PrismaService);
    findFirst.mockResolvedValue({
      customerStatusCode: mapping.customerStatusCode,
      customerLabel: mapping.customerLabel,
      emailTemplateId: null,
      sendEmail: false,
      isTerminal: false,
      requiresAction: false,
    });

    await expect(
      service.resolve(StatusMappingSourceEntityType.REPAIR, '  in_progress '),
    ).resolves.toEqual({
      recognized: true,
      customerStatusCode: 'IN_PROGRESS',
      customerLabel: 'W trakcie naprawy',
      emailTemplateId: null,
      sendEmail: false,
      isTerminal: false,
      requiresAction: false,
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          active: true,
          sourceStatus: { equals: 'in_progress', mode: 'insensitive' },
        }),
      }),
    );
  });

  it('returns recognized=false for unknown and inactive mappings', async () => {
    const service = new StatusMappingService(prisma as unknown as PrismaService);
    findFirst.mockResolvedValue(null);
    await expect(
      service.resolve(StatusMappingSourceEntityType.REPAIR, 'UNKNOWN'),
    ).resolves.toEqual({ recognized: false });
    await expect(
      service.resolve(StatusMappingSourceEntityType.REPAIR, 'INACTIVE'),
    ).resolves.toEqual({ recognized: false });
  });

  it('writes a limited audit event on update', async () => {
    const record = jest.fn().mockResolvedValue({});
    const service = new StatusMappingService(
      prisma as unknown as PrismaService,
      { record } as unknown as AuditService,
    );
    findUnique.mockResolvedValue(mapping);
    findFirst.mockResolvedValue(null);
    update.mockResolvedValue({ ...mapping, active: false });
    transaction.mockImplementation((operation) => operation(prisma));

    await service.update(mapping.id, { active: false }, admin.id);

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'STATUS_MAPPING_UPDATED',
        metadata: {
          changedFields: ['active'],
          previousValues: { active: true },
          newValues: { active: false },
        },
      }),
      prisma,
    );
  });
});

function contextFor(user: AuthenticatedUser): ExecutionContext {
  const request = {
    headers: { cookie: `${SESSION_COOKIE_NAME}=session-token` },
    currentUser: user,
  } as AuthenticatedRequest;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
