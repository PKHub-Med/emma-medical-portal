export interface Membership {
  hospitalId: string;
  hospitalName: string;
  departmentId: string | null;
  role: 'HOSPITAL_USER' | 'HOSPITAL_ADMIN';
}

export interface CurrentUser {
  id: string;
  email: string;
  status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
  systemRole: 'USER' | 'EMMA_ADMIN' | 'SERVICE_OPERATOR';
  memberships: Membership[];
}

export interface LoginCredentials {
  email: string;
  password: string;
}

const apiUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`API request failed with status ${status}`);
  }
}

export function login(
  credentials: LoginCredentials,
): Promise<{ status: 'ok' }> {
  return apiRequest('/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(credentials),
  });
}

export function logout(): Promise<void> {
  return apiRequest('/auth/logout', {
    method: 'POST',
  });
}

export function getCurrentUser(): Promise<CurrentUser> {
  return apiRequest('/me');
}
