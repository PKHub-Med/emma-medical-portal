import type { CookieOptions } from 'express';

export const SESSION_COOKIE_NAME = 'emma_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVALID_CREDENTIALS_MESSAGE =
  'Nieprawidłowy e-mail lub hasło.';

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}
