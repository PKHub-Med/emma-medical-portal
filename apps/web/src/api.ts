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

export interface CreateAdminUserResponse {
  user: AdminUser;
  restored: boolean;
}

export interface AdminUsersParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: UserStatus;
  hospitalId?: string;
}

export type AuditOutcome = 'SUCCESS' | 'FAILURE';

export interface AuditEvent {
  id: string;
  action: string;
  outcome: AuditOutcome;
  actor: { id: string; email: string } | null;
  entityType: string | null;
  entityId: string | null;
  hospital: { id: string; name: string } | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface AuditResponse {
  items: AuditEvent[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface AuditParams {
  page: number;
  pageSize: number;
  search?: string;
  action?: string;
  outcome?: AuditOutcome;
  entityType?: string;
  hospitalId?: string;
  actorId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface DepartmentOption {
  id: string;
  name: string;
}

export interface PortalDevice {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  serialNo: string | null;
  inventoryNo: string | null;
  category: string | null;
  department: DepartmentOption | null;
  active: boolean;
}

export interface DeviceDetails extends PortalDevice {
  qrEpc: string | null;
  passportNo: string | null;
  hospital: { id: string; name: string };
  repairs: DeviceRepair[];
  inspections: DeviceInspection[];
  documents: [];
}

export interface DeviceInspection {
  id: string;
  businessNumber: string;
  customerStatusCode: string;
  customerLabel: string;
  result: string | null;
  plannedAt: string | null;
  performedAt: string | null;
  dueAt: string | null;
  isOverdue: boolean;
}

export interface DeviceRepair {
  id: string;
  businessNumber: string;
  customerStatusCode: string;
  customerLabel: string;
  reportedAt: string | null;
  completedAt: string | null;
}

export type RepairState = 'open' | 'closed' | 'all';

export interface RepairListItem {
  id: string;
  businessNumber: string;
  customerStatusCode: string;
  customerLabel: string;
  isTerminal: boolean;
  reportedAt: string | null;
  updatedAt: string;
  device: {
    id: string;
    name: string;
    serialNo: string | null;
    inventoryNo: string | null;
  };
  department: DepartmentOption | null;
}

export interface RepairsResponse {
  items: RepairListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface RepairsParams {
  page: number;
  pageSize: number;
  search?: string;
  departmentId?: string;
  status?: string;
  state?: RepairState;
  dateFrom?: string;
  dateTo?: string;
}

export interface RepairDetails {
  id: string;
  businessNumber: string;
  customerStatusCode: string;
  customerLabel: string;
  isTerminal: boolean;
  reportedAt: string | null;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  customerDescription: string | null;
  device: {
    id: string;
    name: string;
    manufacturer: string | null;
    model: string | null;
    serialNo: string | null;
    inventoryNo: string | null;
    department: DepartmentOption | null;
    hospital: { id: string; name: string };
  };
  statusHistory: Array<{
    id: string;
    statusCode: string;
    label: string;
    changedAt: string;
  }>;
  documents: [];
}

export type InspectionDue = 'overdue' | 'next30days' | 'future' | 'all';

export interface InspectionListItem extends DeviceInspection {
  isTerminal: boolean;
  updatedAt: string;
  device: {
    id: string;
    name: string;
    serialNo: string | null;
    inventoryNo: string | null;
  };
  department: DepartmentOption | null;
}

export interface InspectionsResponse {
  items: InspectionListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface InspectionsParams {
  page: number;
  pageSize: number;
  search?: string;
  departmentId?: string;
  status?: string;
  result?: string;
  due?: InspectionDue;
  dateFrom?: string;
  dateTo?: string;
}

export interface InspectionDetails {
  id: string;
  businessNumber: string;
  customerStatusCode: string;
  customerLabel: string;
  result: string | null;
  isTerminal: boolean;
  plannedAt: string | null;
  performedAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  isOverdue: boolean;
  customerDescription: string | null;
  device: {
    id: string;
    name: string;
    manufacturer: string | null;
    model: string | null;
    serialNo: string | null;
    inventoryNo: string | null;
    department: DepartmentOption | null;
    hospital: { id: string; name: string };
  };
  statusHistory: Array<{
    id: string;
    statusCode: string;
    label: string;
    changedAt: string;
  }>;
  documents: [];
}

export interface DevicesResponse {
  items: PortalDevice[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface DevicesParams {
  page: number;
  pageSize: number;
  search?: string;
  departmentId?: string;
  manufacturer?: string;
  category?: string;
  active?: boolean;
}

export interface DashboardStatusChange {
  id: string;
  entityType: 'REPAIR' | 'INSPECTION';
  entityId: string;
  businessNumber: string;
  deviceName: string;
  statusCode: string;
  label: string;
  changedAt: string;
}

export interface DashboardUpcomingInspection {
  id: string;
  businessNumber: string;
  deviceName: string;
  departmentName: string | null;
  dueAt: string;
  daysUntilDue: number;
}

export interface DashboardSummary {
  openRepairs: number;
  overdueInspections: number;
  inspectionsNext30Days: number;
  devices: number;
  recentStatusChanges: DashboardStatusChange[];
  upcomingInspections: DashboardUpcomingInspection[];
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
}): Promise<CreateAdminUserResponse> {
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

export function getAdminAudit(
  params: AuditParams,
): Promise<AuditResponse> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  });
  return apiRequest(`/admin/audit?${query.toString()}`);
}

export function getDevices(params: DevicesParams): Promise<DevicesResponse> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return apiRequest(`/devices?${query.toString()}`);
}

export function getDevice(id: string): Promise<DeviceDetails> {
  return apiRequest(`/devices/${encodeURIComponent(id)}`);
}

export function getRepairs(params: RepairsParams): Promise<RepairsResponse> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return apiRequest(`/repairs?${query.toString()}`);
}

export function getRepair(id: string): Promise<RepairDetails> {
  return apiRequest(`/repairs/${encodeURIComponent(id)}`);
}

export function getInspections(params: InspectionsParams): Promise<InspectionsResponse> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return apiRequest(`/inspections?${query.toString()}`);
}

export function getInspection(id: string): Promise<InspectionDetails> {
  return apiRequest(`/inspections/${encodeURIComponent(id)}`);
}

export function getDepartments(): Promise<{ items: DepartmentOption[] }> {
  return apiRequest('/departments');
}

export function getDashboardSummary(): Promise<DashboardSummary> {
  return apiRequest('/dashboard/summary');
}
