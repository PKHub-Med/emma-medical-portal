import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Injectable()
export class PortalUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (request.currentUser?.systemRole !== 'USER') {
      throw new ForbiddenException();
    }

    return true;
  }
}
