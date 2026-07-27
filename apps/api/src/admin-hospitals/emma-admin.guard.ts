import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Injectable()
export class EmmaAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (request.currentUser?.systemRole !== 'EMMA_ADMIN') {
      throw new ForbiddenException();
    }

    return true;
  }
}
