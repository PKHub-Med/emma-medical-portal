import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuthService } from '../src/auth/auth.service';
import { INVALID_CREDENTIALS_MESSAGE } from '../src/auth/auth.constants';
import { hashPassword } from '../src/auth/password';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AuthService', () => {
  const userFindUnique = jest.fn();
  const userUpdate = jest.fn();
  const sessionCreate = jest.fn();
  const sessionFindUnique = jest.fn();
  const sessionUpdate = jest.fn();
  const sessionUpdateMany = jest.fn();
  const transaction = jest.fn();
  const prismaMock = {
    user: {
      findUnique: userFindUnique,
      update: userUpdate,
    },
    userSession: {
      create: sessionCreate,
      findUnique: sessionFindUnique,
      update: sessionUpdate,
      updateMany: sessionUpdateMany,
    },
    $transaction: transaction,
  };

  let authService: AuthService;
  let validPasswordHash: string;

  beforeAll(async () => {
    validPasswordHash = await hashPassword('correct-password');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    userUpdate.mockResolvedValue({});
    sessionCreate.mockResolvedValue({});
    sessionUpdate.mockResolvedValue({});
    sessionUpdateMany.mockResolvedValue({ count: 1 });
    transaction.mockImplementation(
      async (operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
    );
    authService = new AuthService(
      prismaMock as unknown as PrismaService,
    );
  });

  it('creates a session with only a SHA-256 token hash after valid login', async () => {
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      email: 'admin@example.com',
      passwordHash: validPasswordHash,
      status: 'ACTIVE',
    });

    const token = await authService.login(
      'ADMIN@example.com',
      'correct-password',
    );

    const sessionData = sessionCreate.mock.calls[0][0].data;
    expect(token).toHaveLength(43);
    expect(sessionData.userId).toBe('user-id');
    expect(sessionData.tokenHash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(sessionData.tokenHash).not.toBe(token);
    expect(sessionData.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 6 * 24 * 60 * 60 * 1000,
    );
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { lastLoginAt: expect.any(Date) },
    });
  });

  it('returns HTTP 401 with the generic message for an invalid password', async () => {
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      email: 'admin@example.com',
      passwordHash: validPasswordHash,
      status: 'ACTIVE',
    });

    await expect(
      authService.login('admin@example.com', 'wrong-password'),
    ).rejects.toMatchObject({
      status: 401,
      message: INVALID_CREDENTIALS_MESSAGE,
    });
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('uses the same HTTP 401 message for a nonexistent user', async () => {
    userFindUnique.mockResolvedValue(null);

    await expect(
      authService.login('missing@example.com', 'wrong-password'),
    ).rejects.toMatchObject({
      status: 401,
      message: INVALID_CREDENTIALS_MESSAGE,
    });
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('does not allow a BLOCKED user to log in', async () => {
    userFindUnique.mockResolvedValue({
      id: 'blocked-user-id',
      email: 'blocked@example.com',
      passwordHash: validPasswordHash,
      status: 'BLOCKED',
    });

    await expect(
      authService.login('blocked@example.com', 'correct-password'),
    ).rejects.toMatchObject({
      status: 401,
      message: INVALID_CREDENTIALS_MESSAGE,
    });
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('does not allow an INACTIVE user to log in', async () => {
    userFindUnique.mockResolvedValue({
      id: 'inactive-user-id',
      email: 'inactive@example.com',
      passwordHash: validPasswordHash,
      status: 'INACTIVE',
    });

    await expect(
      authService.login('inactive@example.com', 'correct-password'),
    ).rejects.toMatchObject({
      status: 401,
      message: INVALID_CREDENTIALS_MESSAGE,
    });
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('returns the user profile and memberships for a valid session', async () => {
    sessionFindUnique.mockResolvedValue({
      id: 'session-id',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: {
        id: 'user-id',
        email: 'user@example.com',
        status: 'ACTIVE',
        systemRole: 'USER',
        memberships: [
          {
            hospitalId: 'hospital-id',
            departmentId: null,
            role: 'HOSPITAL_USER',
            hospital: {
              name: 'Szpital Testowy',
            },
          },
        ],
      },
    });

    await expect(
      authService.getAuthenticatedUser('raw-session-token'),
    ).resolves.toEqual({
      id: 'user-id',
      email: 'user@example.com',
      status: 'ACTIVE',
      systemRole: 'USER',
      memberships: [
        {
          hospitalId: 'hospital-id',
          hospitalName: 'Szpital Testowy',
          departmentId: null,
          role: 'HOSPITAL_USER',
        },
      ],
    });
    expect(sessionUpdate).toHaveBeenCalledWith({
      where: { id: 'session-id' },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it('revokes logout sessions using the SHA-256 token hash', async () => {
    await authService.revokeSession('raw-session-token');

    expect(sessionUpdateMany).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256')
          .update('raw-session-token')
          .digest('hex'),
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });
  });

  it('rejects expired sessions', async () => {
    sessionFindUnique.mockResolvedValue({
      id: 'session-id',
      expiresAt: new Date(Date.now() - 1),
      revokedAt: null,
      user: {
        status: 'ACTIVE',
      },
    });

    await expect(
      authService.getAuthenticatedUser('expired-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
