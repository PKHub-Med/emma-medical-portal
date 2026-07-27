import type { Request } from 'express';
import type { AuditRequestContext } from './audit.types';

export function auditContextFromRequest(
  request: Request,
): AuditRequestContext {
  const requestIdHeader = request.headers?.['x-request-id'];
  const userAgent =
    typeof request.get === 'function'
      ? request.get('user-agent')
      : request.headers?.['user-agent'];

  return {
    ipAddress:
      request.ip || request.socket?.remoteAddress || undefined,
    userAgent: userAgent?.slice(0, 1024),
    requestId:
      typeof requestIdHeader === 'string'
        ? requestIdHeader.slice(0, 255)
        : undefined,
  };
}
