import {
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthController } from '../src/auth/auth.controller';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  sessionCookieOptions,
} from '../src/auth/auth.constants';
import type { AuthenticatedRequest } from '../src/auth/authenticated-request';
import { AuthService } from '../src/auth/auth.service';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { SessionAuthGuard } from '../src/auth/session-auth.guard';

describe('AuthController and SessionAuthGuard', () => {
  const profile: AuthenticatedUser = {
    id: 'user-id',
    email: 'user@example.com',
    status: 'ACTIVE',
    systemRole: 'USER',
    memberships: [],
  };
  const login = jest.fn();
  const getAuthenticatedUser = jest.fn();
  const revokeSession = jest.fn();
  const authServiceMock = {
    login,
    getAuthenticatedUser,
    revokeSession,
  };
  const cookie = jest.fn();
  const clearCookie = jest.fn();
  const responseMock = {
    cookie,
    clearCookie,
  } as unknown as Response;

  let controller: AuthController;
  let guard: SessionAuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(
      authServiceMock as unknown as AuthService,
    );
    guard = new SessionAuthGuard(
      authServiceMock as unknown as AuthService,
    );
  });

  it('sets the configured session cookie after login', async () => {
    login.mockResolvedValue('raw-session-token');

    await expect(
      controller.login(
        {
          email: 'user@example.com',
          password: 'password',
        },
        responseMock,
      ),
    ).resolves.toEqual({ status: 'ok' });
    expect(cookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      'raw-session-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_TTL_MS,
      }),
    );
  });

  it('uses cross-site-safe session cookie options in production', async () => {
    const previousNodeEnv = process.env.NODE_ENV;

    try {
      process.env.NODE_ENV = 'production';
      login.mockResolvedValue('raw-session-token');

      await controller.login(
        {
          email: 'user@example.com',
          password: 'password',
        },
        responseMock,
      );

      expect(cookie).toHaveBeenCalledWith(
        SESSION_COOKIE_NAME,
        'raw-session-token',
        {
          httpOnly: true,
          secure: true,
          sameSite: 'none',
          path: '/',
          maxAge: SESSION_TTL_MS,
        },
      );
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('allows GET /me with a valid session cookie', async () => {
    getAuthenticatedUser.mockResolvedValue(profile);
    const request = {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=raw-session-token`,
      },
    } as AuthenticatedRequest;

    await expect(
      guard.canActivate(contextFor(request)),
    ).resolves.toBe(true);
    expect(getAuthenticatedUser).toHaveBeenCalledWith(
      'raw-session-token',
    );
    expect(controller.getMe(request)).toEqual(profile);
    expect(request.currentUser).toEqual(profile);
  });

  it('returns HTTP 401 for GET /me without a session cookie', async () => {
    const request = {
      headers: {},
    } as AuthenticatedRequest;

    await expect(
      guard.canActivate(contextFor(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes the current session and clears its cookie on logout', async () => {
    revokeSession.mockResolvedValue(undefined);
    const request = {
      headers: {},
      currentUser: profile,
      sessionToken: 'raw-session-token',
    } as AuthenticatedRequest;

    await controller.logout(request, responseMock);

    expect(revokeSession).toHaveBeenCalledWith('raw-session-token');
    expect(clearCookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      }),
    );
  });
});

function contextFor(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}
