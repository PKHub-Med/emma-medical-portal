import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SESSION_COOKIE_NAME } from './auth.constants';
import type { AuthenticatedRequest } from './authenticated-request';
import { AuthService } from './auth.service';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.readCookie(
      request.headers.cookie,
      SESSION_COOKIE_NAME,
    );

    if (!token) {
      throw new UnauthorizedException();
    }

    const authContext =
      await this.authService.getAuthenticatedContext(token);
    request.currentUser = authContext.user;
    request.currentSessionId = authContext.sessionId;
    request.sessionToken = token;

    return true;
  }

  private readCookie(
    cookieHeader: string | undefined,
    name: string,
  ): string | undefined {
    if (!cookieHeader) {
      return undefined;
    }

    for (const pair of cookieHeader.split(';')) {
      const separatorIndex = pair.indexOf('=');

      if (separatorIndex === -1) {
        continue;
      }

      const key = pair.slice(0, separatorIndex).trim();

      if (key !== name) {
        continue;
      }

      try {
        return decodeURIComponent(pair.slice(separatorIndex + 1).trim());
      } catch {
        return undefined;
      }
    }

    return undefined;
  }
}
