import type { Request } from 'express';
import type { AuthenticatedUser } from './auth.types';

export interface AuthenticatedRequest extends Request {
  currentUser?: AuthenticatedUser;
  currentSessionId?: string;
  sessionToken?: string;
}
