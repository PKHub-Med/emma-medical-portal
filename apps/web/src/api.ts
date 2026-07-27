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

export interface AdminHospital {
  id: string;
  name: string;
  active: boolean;
  portalEnabled: boolean;
  departmentsCount: number;
  membershipsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminHospitalsResponse {
  items: AdminHospital[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface AdminHospitalsParams {
  page: number;
  pageSize: number;
  search?: string;
  active?: boolean;
  portalEnabled?: boolean;
}

export interface UpdateHospitalInput {
  name?: string;
  active?: boolean;
  portalEnabled?: boolean;
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

export function getAdminHospitals(
  params: AdminHospitalsParams,
): Promise<AdminHospitalsResponse> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });

  if (params.search) {
    query.set('search', params.search);
  }

  if (params.active !== undefined) {
    query.set('active', String(params.active));
  }

  if (params.portalEnabled !== undefined) {
    query.set('portalEnabled', String(params.portalEnabled));
  }

  return apiRequest(`/admin/hospitals?${query.toString()}`);
}

export function createAdminHospital(input: {
  name: string;
}): Promise<AdminHospital> {
  return apiRequest('/admin/hospitals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
}

export function updateAdminHospital({
  id,
  data,
}: {
  id: string;
  data: UpdateHospitalInput;
}): Promise<AdminHospital> {
  return apiRequest(`/admin/hospitals/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
}
