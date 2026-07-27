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
  activeHospital?: PortalHospital | null;
}

export interface PortalHospital {
  id: string;
  name: string;
  role: 'HOSPITAL_USER' | 'HOSPITAL_ADMIN';
}

export interface PortalHospitalsResponse {
  items: PortalHospital[];
  activeHospitalId: string | null;
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

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
export type MembershipRole = 'HOSPITAL_USER' | 'HOSPITAL_ADMIN';

export interface AdminUserMembership {
  id: string;
  hospitalId: string;
  hospitalName: string;
  departmentId: string | null;
  role: MembershipRole;
}

export interface AdminUser {
  id: string;
  email: string;
  status: UserStatus;
  systemRole: CurrentUser['systemRole'];
  lastLoginAt: string | null;
  createdAt: string;
  memberships: AdminUserMembership[];
}

export interface AdminUsersResponse {
  items: AdminUser[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface AdminUsersParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: UserStatus;
  hospitalId?: string;
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

export function getPortalHospitals(): Promise<PortalHospitalsResponse> {
  return apiRequest('/hospitals');
}

export function setActiveHospital(
  hospitalId: string,
): Promise<PortalHospital> {
  return apiRequest('/me/active-hospital', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId }),
  });
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

export function getAdminUsers(
  params: AdminUsersParams,
): Promise<AdminUsersResponse> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });

  if (params.search) {
    query.set('search', params.search);
  }

  if (params.status) {
    query.set('status', params.status);
  }

  if (params.hospitalId) {
    query.set('hospitalId', params.hospitalId);
  }

  return apiRequest(`/admin/users?${query.toString()}`);
}

export function createAdminUser(input: {
  email: string;
  temporaryPassword: string;
  hospitalId: string;
  membershipRole: MembershipRole;
}): Promise<AdminUser> {
  return apiRequest('/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteAdminUser(id: string): Promise<void> {
  return apiRequest(`/admin/users/${id}`, {
    method: 'DELETE',
  });
}

export function updateAdminUserStatus({
  id,
  status,
}: {
  id: string;
  status: UserStatus;
}): Promise<AdminUser> {
  return apiRequest(`/admin/users/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export function addAdminUserMembership({
  userId,
  hospitalId,
  role,
}: {
  userId: string;
  hospitalId: string;
  role: MembershipRole;
}): Promise<AdminUserMembership> {
  return apiRequest(`/admin/users/${userId}/memberships`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId, role }),
  });
}

export function updateAdminUserMembership({
  userId,
  membershipId,
  role,
}: {
  userId: string;
  membershipId: string;
  role: MembershipRole;
}): Promise<AdminUserMembership> {
  return apiRequest(
    `/admin/users/${userId}/memberships/${membershipId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    },
  );
}

export function deleteAdminUserMembership({
  userId,
  membershipId,
}: {
  userId: string;
  membershipId: string;
}): Promise<void> {
  return apiRequest(
    `/admin/users/${userId}/memberships/${membershipId}`,
    { method: 'DELETE' },
  );
}
