import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Optional,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import {
  MembershipRole,
  SystemRole,
  UserStatus,
} from '../generated/prisma/enums';
import { hashPassword } from '../auth/password';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuditRequestContext } from '../audit/audit.types';
import { AuditOutcome } from '../generated/prisma/enums';
import type {
  AdminMembershipItem,
  AdminUserItem,
  AdminUsersPage,
  AdminUsersQuery,
} from './admin-users.types';

const membershipSelection = {
  id: true,
  hospitalId: true,
  departmentId: true,
  role: true,
  hospital: {
    select: {
      name: true,
    },
  },
} as const;

const userSelection = {
  id: true,
  email: true,
  status: true,
  systemRole: true,
  lastLoginAt: true,
  createdAt: true,
  memberships: {
    select: membershipSelection,
    orderBy: { hospital: { name: 'asc' } },
  },
} as const;

type SelectedMembership = {
  id: string;
  hospitalId: string;
  departmentId: string | null;
  role: MembershipRole;
  hospital: { name: string };
};

type SelectedUser = {
  id: string;
  email: string;
  status: UserStatus;
  systemRole: SystemRole;
  lastLoginAt: Date | null;
  createdAt: Date;
  memberships: SelectedMembership[];
};

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  async list(query: AdminUsersQuery): Promise<AdminUsersPage> {
    const page = parsePositiveInteger(query.page, 'page', 1);
    const pageSize = parsePositiveInteger(
      query.pageSize,
      'pageSize',
      25,
      100,
    );
    const search = query.search?.trim().toLowerCase();
    const status = parseOptionalStatus(query.status);
    const hospitalId = query.hospitalId?.trim();
    const includeDeleted = parseOptionalBoolean(
      query.includeDeleted,
      'includeDeleted',
      false,
    );

    if (search && search.length > 320) {
      throw new BadRequestException(
        'Wyszukiwanie może mieć maksymalnie 320 znaków.',
      );
    }

    if (hospitalId && !isUuid(hospitalId)) {
      throw new BadRequestException(
        'Identyfikator szpitala jest nieprawidłowy.',
      );
    }

    const where: Prisma.UserWhereInput = {
      ...(includeDeleted ? {} : { deletedAt: null }),
      ...(search
        ? { email: { contains: search, mode: 'insensitive' } }
        : {}),
      ...(status ? { status } : {}),
      ...(hospitalId
        ? { memberships: { some: { hospitalId } } }
        : {}),
    };

    try {
      const [users, totalCount] = await this.prisma.$transaction([
        this.prisma.user.findMany({
          where,
          select: userSelection,
          orderBy: [{ email: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.user.count({ where }),
      ]);

      return {
        items: (users as SelectedUser[]).map(toAdminUserItem),
        page,
        pageSize,
        totalCount,
      };
    } catch {
      throw new ServiceUnavailableException(
        'Nie udało się pobrać listy użytkowników.',
      );
    }
  }

  async create(
    body: unknown,
    actorId?: string,
    requestContext: AuditRequestContext = {},
  ): Promise<AdminUserItem> {
    const data = parseCreateUserBody(body);

    const existingUser = await this.safeFindUserByEmail(data.email);

    if (existingUser) {
      throw new ConflictException(
        'Użytkownik z tym adresem e-mail już istnieje.',
      );
    }

    const hospital = await this.requireActiveHospital(data.hospitalId);
    const passwordHash = await hashPassword(data.temporaryPassword);

    try {
      const create = (client: typeof this.prisma) =>
        client.user.create({
          data: {
            email: data.email,
            passwordHash,
            status: UserStatus.ACTIVE,
            systemRole: SystemRole.USER,
            memberships: {
              create: {
                hospitalId: hospital.id,
                departmentId: null,
                role: data.membershipRole,
              },
            },
          },
          select: userSelection,
        });
      const user =
        this.auditService && actorId
          ? await this.prisma.$transaction(async (tx) => {
              const created = await create(tx as typeof this.prisma);
              await this.auditService!.record(
                {
                  actorId,
                  action: 'USER_CREATED',
                  outcome: AuditOutcome.SUCCESS,
                  entityType: 'USER',
                  entityId: created.id,
                  hospitalId: hospital.id,
                  metadata: {
                    changedFields: ['email', 'status', 'systemRole'],
                    newValues: {
                      email: data.email,
                      status: UserStatus.ACTIVE,
                      systemRole: SystemRole.USER,
                    },
                  },
                  ...requestContext,
                },
                tx,
              );
              const membership = created.memberships[0];
              if (membership) {
                await this.auditService!.record(
                  {
                    actorId,
                    action: 'MEMBERSHIP_CREATED',
                    outcome: AuditOutcome.SUCCESS,
                    entityType: 'MEMBERSHIP',
                    entityId: membership.id,
                    hospitalId: hospital.id,
                    metadata: {
                      userId: created.id,
                      role: data.membershipRole,
                    },
                    ...requestContext,
                  },
                  tx,
                );
              }
              return created;
            })
          : await create(this.prisma);

      return toAdminUserItem(user as SelectedUser);
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException(
          'Użytkownik z tym adresem e-mail już istnieje.',
        );
      }

      throw new InternalServerErrorException(
        'Nie udało się utworzyć użytkownika.',
      );
    }
  }

  async updateStatus(
    id: string,
    body: unknown,
    administratorId: string,
    requestContext: AuditRequestContext = {},
  ): Promise<AdminUserItem> {
    validateUuid(id, 'użytkownika');
    const status = parseStatusBody(body);

    if (
      id === administratorId &&
      (status === UserStatus.INACTIVE || status === UserStatus.BLOCKED)
    ) {
      throw new ForbiddenException(
        'Nie możesz dezaktywować ani zablokować własnego konta.',
      );
    }

    const existingUser = await this.safeFindUserById(id);

    if (!existingUser) {
      throw new NotFoundException('Nie znaleziono użytkownika.');
    }

    try {
      const userUpdate = this.prisma.user.update({
        where: { id },
        data: { status },
        select: userSelection,
      });

      if (status === UserStatus.ACTIVE && !this.auditService) {
        return toAdminUserItem(
          (await userUpdate) as SelectedUser,
        );
      }

      const now = new Date();
      const operations: Prisma.PrismaPromise<unknown>[] = [
        userUpdate,
        ...(status === UserStatus.ACTIVE ? [] : [this.prisma.userSession.updateMany({
          where: {
            userId: id,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { revokedAt: now },
        })]),
      ];
      if (this.auditService) {
        operations.push(
          this.auditService.record({
            actorId: administratorId,
            action: 'USER_STATUS_CHANGED',
            outcome: AuditOutcome.SUCCESS,
            entityType: 'USER',
            entityId: id,
            metadata: {
              changedFields: ['status'],
              newValues: { status },
            },
            ...requestContext,
          }),
        );
      }
      const [user] = await this.prisma.$transaction(operations);

      return toAdminUserItem(user as SelectedUser);
    } catch {
      throw new InternalServerErrorException(
        'Nie udało się zmienić statusu użytkownika.',
      );
    }
  }

  async deleteUser(
    id: string,
    administratorId: string,
    requestContext: AuditRequestContext = {},
  ): Promise<void> {
    validateUuid(id, 'użytkownika');

    if (id === administratorId) {
      throw new ForbiddenException(
        'Nie możesz usunąć własnego konta.',
      );
    }

    const existingUser = await this.safeFindUserForDeletion(id);

    if (!existingUser || existingUser.deletedAt) {
      throw new NotFoundException('Nie znaleziono użytkownika.');
    }

    if (existingUser.systemRole !== SystemRole.USER) {
      throw new ForbiddenException(
        'Tą operacją można usuwać wyłącznie zwykłe konta użytkowników.',
      );
    }

    const now = new Date();

    try {
      const operations: Prisma.PrismaPromise<unknown>[] = [
        this.prisma.user.update({
          where: { id },
          data: {
            status: UserStatus.INACTIVE,
            deletedAt: now,
            deletedByUserId: administratorId,
          },
          select: { id: true },
        }),
        this.prisma.userSession.updateMany({
          where: {
            userId: id,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { revokedAt: now },
        }),
        this.prisma.membership.deleteMany({
          where: { userId: id },
        }),
      ];
      if (this.auditService) {
        operations.push(
          this.auditService.record({
            actorId: administratorId,
            action: 'USER_DELETED',
            outcome: AuditOutcome.SUCCESS,
            entityType: 'USER',
            entityId: id,
            metadata: {
              changedFields: ['status', 'deletedAt'],
              previousValues: { status: 'ACTIVE', deletedAt: null },
              newValues: { status: 'INACTIVE', deletedAt: now.toISOString() },
            },
            ...requestContext,
          }),
        );
      }
      await this.prisma.$transaction(operations);
    } catch {
      throw new InternalServerErrorException(
        'Nie udało się usunąć konta użytkownika.',
      );
    }
  }

  async addMembership(
    userId: string,
    body: unknown,
    actorId?: string,
    requestContext: AuditRequestContext = {},
  ): Promise<AdminMembershipItem> {
    validateUuid(userId, 'użytkownika');
    const data = parseAddMembershipBody(body);

    const [user, hospital] = await Promise.all([
      this.safeFindUserById(userId),
      this.requireActiveHospital(data.hospitalId),
    ]);

    if (!user) {
      throw new NotFoundException('Nie znaleziono użytkownika.');
    }

    let duplicate: { id: string } | null;

    try {
      duplicate = await this.prisma.membership.findFirst({
        where: {
          userId,
          hospitalId: data.hospitalId,
          departmentId: null,
          role: data.role,
        },
        select: { id: true },
      });
    } catch {
      throw new ServiceUnavailableException(
        'Nie udało się sprawdzić dostępu użytkownika.',
      );
    }

    if (duplicate) {
      throw new ConflictException(
        'Taki dostęp użytkownika już istnieje.',
      );
    }

    try {
      const create = (client: typeof this.prisma) =>
        client.membership.create({
          data: {
            userId,
            hospitalId: data.hospitalId,
            departmentId: null,
            role: data.role,
          },
          select: membershipSelection,
        });
      const membership =
        this.auditService && actorId
          ? await this.prisma.$transaction(async (tx) => {
              const created = await create(tx as typeof this.prisma);
              await this.auditService!.record(
                {
                  actorId,
                  action: 'MEMBERSHIP_CREATED',
                  outcome: AuditOutcome.SUCCESS,
                  entityType: 'MEMBERSHIP',
                  entityId: created.id,
                  hospitalId: data.hospitalId,
                  metadata: { userId, role: data.role },
                  ...requestContext,
                },
                tx,
              );
              return created;
            })
          : await create(this.prisma);

      return toAdminMembershipItem(
        membership as SelectedMembership,
      );
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException(
          'Taki dostęp użytkownika już istnieje.',
        );
      }

      throw new InternalServerErrorException(
        'Nie udało się dodać dostępu użytkownika.',
      );
    }
  }

  async updateMembership(
    userId: string,
    membershipId: string,
    body: unknown,
    actorId?: string,
    requestContext: AuditRequestContext = {},
  ): Promise<AdminMembershipItem> {
    validateUuid(userId, 'użytkownika');
    validateUuid(membershipId, 'dostępu');
    const role = parseMembershipRoleBody(body);
    const membership = await this.safeFindMembership(
      userId,
      membershipId,
    );

    if (!membership) {
      throw new NotFoundException(
        'Nie znaleziono dostępu użytkownika.',
      );
    }

    try {
      const update = (client: typeof this.prisma) =>
        client.membership.update({
          where: { id: membershipId },
          data: { role },
          select: membershipSelection,
        });
      const updated =
        this.auditService && actorId
          ? await this.prisma.$transaction(async (tx) => {
              const changed = await update(tx as typeof this.prisma);
              await this.auditService!.record(
                {
                  actorId,
                  action: 'MEMBERSHIP_UPDATED',
                  outcome: AuditOutcome.SUCCESS,
                  entityType: 'MEMBERSHIP',
                  entityId: membershipId,
                  hospitalId: changed.hospitalId,
                  metadata: {
                    userId,
                    changedFields: ['role'],
                    newValues: { role },
                  },
                  ...requestContext,
                },
                tx,
              );
              return changed;
            })
          : await update(this.prisma);

      return toAdminMembershipItem(updated as SelectedMembership);
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException(
          'Taki dostęp użytkownika już istnieje.',
        );
      }

      throw new InternalServerErrorException(
        'Nie udało się zmienić roli dostępu.',
      );
    }
  }

  async deleteMembership(
    userId: string,
    membershipId: string,
    actorId?: string,
    requestContext: AuditRequestContext = {},
  ): Promise<void> {
    validateUuid(userId, 'użytkownika');
    validateUuid(membershipId, 'dostępu');

    try {
      const remove = (client: typeof this.prisma) =>
        client.membership.deleteMany({
          where: {
            id: membershipId,
            userId,
          },
        });
      const result =
        this.auditService && actorId
          ? await this.prisma.$transaction(async (tx) => {
              const existing = await tx.membership.findFirst({
                where: { id: membershipId, userId },
                select: { hospitalId: true, role: true },
              });
              if (!existing) return { count: 0 };
              const deleted = await remove(tx as typeof this.prisma);
              await this.auditService!.record(
                {
                  actorId,
                  action: 'MEMBERSHIP_DELETED',
                  outcome: AuditOutcome.SUCCESS,
                  entityType: 'MEMBERSHIP',
                  entityId: membershipId,
                  hospitalId: existing.hospitalId,
                  metadata: { userId, role: existing.role },
                  ...requestContext,
                },
                tx,
              );
              return deleted;
            })
          : await remove(this.prisma);

      if (result.count === 0) {
        throw new NotFoundException(
          'Nie znaleziono dostępu użytkownika.',
        );
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Nie udało się usunąć dostępu użytkownika.',
      );
    }
  }

  private async safeFindUserByEmail(
    email: string,
  ): Promise<{ id: string } | null> {
    try {
      return await this.prisma.user.findFirst({
        where: {
          email: { equals: email, mode: 'insensitive' },
        },
        select: { id: true },
      });
    } catch {
      throw new ServiceUnavailableException(
        'Nie udało się sprawdzić adresu e-mail.',
      );
    }
  }

  private async safeFindUserById(
    id: string,
  ): Promise<{ id: string } | null> {
    try {
      return await this.prisma.user.findUnique({
        where: { id },
        select: { id: true },
      });
    } catch {
      throw new ServiceUnavailableException(
        'Nie udało się sprawdzić użytkownika.',
      );
    }
  }

  private async safeFindUserForDeletion(
    id: string,
  ): Promise<{
    id: string;
    systemRole: SystemRole;
    deletedAt: Date | null;
  } | null> {
    try {
      return await this.prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          systemRole: true,
          deletedAt: true,
        },
      });
    } catch {
      throw new ServiceUnavailableException(
        'Nie udało się sprawdzić użytkownika.',
      );
    }
  }

  private async requireActiveHospital(
    id: string,
  ): Promise<{ id: string }> {
    try {
      const hospital = await this.prisma.hospital.findUnique({
        where: { id },
        select: { id: true, active: true },
      });

      if (!hospital) {
        throw new NotFoundException('Nie znaleziono szpitala.');
      }

      if (!hospital.active) {
        throw new ConflictException(
          'Nie można przypisać dostępu do nieaktywnego szpitala.',
        );
      }

      return hospital;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'Nie udało się sprawdzić szpitala.',
      );
    }
  }

  private async safeFindMembership(
    userId: string,
    membershipId: string,
  ): Promise<{ id: string } | null> {
    try {
      return await this.prisma.membership.findFirst({
        where: {
          id: membershipId,
          userId,
        },
        select: { id: true },
      });
    } catch {
      throw new ServiceUnavailableException(
        'Nie udało się sprawdzić dostępu użytkownika.',
      );
    }
  }
}

function toAdminUserItem(user: SelectedUser): AdminUserItem {
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    systemRole: user.systemRole,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    memberships: user.memberships.map(toAdminMembershipItem),
  };
}

function toAdminMembershipItem(
  membership: SelectedMembership,
): AdminMembershipItem {
  return {
    id: membership.id,
    hospitalId: membership.hospitalId,
    hospitalName: membership.hospital.name,
    departmentId: membership.departmentId,
    role: membership.role,
  };
}

function parseCreateUserBody(body: unknown): {
  email: string;
  temporaryPassword: string;
  hospitalId: string;
  membershipRole: MembershipRole;
} {
  const record = requireRecord(body);
  rejectUnknownFields(record, [
    'email',
    'temporaryPassword',
    'hospitalId',
    'membershipRole',
  ]);
  const email = parseEmail(record.email);
  const temporaryPassword = parsePassword(record.temporaryPassword);
  const hospitalId = parseUuidValue(record.hospitalId, 'szpitala');
  const membershipRole = parseMembershipRole(record.membershipRole);

  return { email, temporaryPassword, hospitalId, membershipRole };
}

function parseAddMembershipBody(body: unknown): {
  hospitalId: string;
  role: MembershipRole;
} {
  const record = requireRecord(body);
  rejectUnknownFields(record, ['hospitalId', 'role']);

  return {
    hospitalId: parseUuidValue(record.hospitalId, 'szpitala'),
    role: parseMembershipRole(record.role),
  };
}

function parseMembershipRoleBody(body: unknown): MembershipRole {
  const record = requireRecord(body);
  rejectUnknownFields(record, ['role']);
  return parseMembershipRole(record.role);
}

function parseStatusBody(body: unknown): UserStatus {
  const record = requireRecord(body);
  rejectUnknownFields(record, ['status']);

  if (
    record.status !== UserStatus.ACTIVE &&
    record.status !== UserStatus.INACTIVE &&
    record.status !== UserStatus.BLOCKED
  ) {
    throw new BadRequestException(
      'Status użytkownika jest nieprawidłowy.',
    );
  }

  return record.status;
}

function parseMembershipRole(value: unknown): MembershipRole {
  if (
    value !== MembershipRole.HOSPITAL_USER &&
    value !== MembershipRole.HOSPITAL_ADMIN
  ) {
    throw new BadRequestException(
      'Rola dostępu jest nieprawidłowa.',
    );
  }

  return value;
}

function parseEmail(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('Adres e-mail jest wymagany.');
  }

  const email = value.trim().toLowerCase();

  if (
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new BadRequestException('Adres e-mail jest nieprawidłowy.');
  }

  return email;
}

function parsePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 12) {
    throw new BadRequestException(
      'Hasło tymczasowe musi mieć co najmniej 12 znaków.',
    );
  }

  if (value.length > 256) {
    throw new BadRequestException(
      'Hasło tymczasowe może mieć maksymalnie 256 znaków.',
    );
  }

  return value;
}

function parseOptionalStatus(value: string | undefined): UserStatus | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }

  if (
    value !== UserStatus.ACTIVE &&
    value !== UserStatus.INACTIVE &&
    value !== UserStatus.BLOCKED
  ) {
    throw new BadRequestException(
      'Parametr status jest nieprawidłowy.',
    );
  }

  return value;
}

function parseOptionalBoolean(
  value: string | undefined,
  field: string,
  defaultValue: boolean,
): boolean {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new BadRequestException(
    `Parametr ${field} musi mieć wartość true albo false.`,
  );
}

function parsePositiveInteger(
  value: string | undefined,
  field: string,
  defaultValue: number,
  maximum?: number,
): number {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  if (!/^\d+$/.test(value)) {
    throw new BadRequestException(
      `Parametr ${field} musi być dodatnią liczbą całkowitą.`,
    );
  }

  const number = Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < 1 ||
    (maximum !== undefined && number > maximum)
  ) {
    throw new BadRequestException(
      `Parametr ${field} ma nieprawidłową wartość.`,
    );
  }

  return number;
}

function requireRecord(body: unknown): Record<string, unknown> {
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body)
  ) {
    throw new BadRequestException(
      'Nieprawidłowy format danych wejściowych.',
    );
  }

  return body as Record<string, unknown>;
}

function rejectUnknownFields(
  record: Record<string, unknown>,
  allowedFields: string[],
): void {
  if (Object.keys(record).some((key) => !allowedFields.includes(key))) {
    throw new BadRequestException(
      'Dane zawierają niedozwolone pola.',
    );
  }
}

function parseUuidValue(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(
      `Identyfikator ${label} jest nieprawidłowy.`,
    );
  }

  validateUuid(value, label);
  return value;
}

function validateUuid(value: string, label: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new BadRequestException(
      `Identyfikator ${label} jest nieprawidłowy.`,
    );
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}
