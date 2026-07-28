import {
  queryOptions,
  useQuery,
} from '@tanstack/react-query';
import {
  getAdminHospitals,
  getAdminUsers,
  getAdminAudit,
  getCurrentUser,
  getPortalHospitals,
  type AdminHospitalsParams,
  type AdminUsersParams,
  type AuditParams,
  getDevices,
  getDevice,
  getDepartments,
  type DevicesParams,
  getRepairs,
  getRepair,
  type RepairsParams,
  getInspections,
  getInspection,
  type InspectionsParams,
  getDashboardSummary,
  getStatusMappings,
  type StatusMappingsParams,
  getAdminEmails,
  type AdminEmailsParams,
} from './api';

export const currentUserQueryKey = ['current-user'] as const;

export function currentUserQueryOptions() {
  return queryOptions({
    queryKey: currentUserQueryKey,
    queryFn: getCurrentUser,
    retry: false,
    staleTime: Infinity,
  });
}

export function useCurrentUser() {
  return useQuery(currentUserQueryOptions());
}

export const portalHospitalsQueryKey = ['portal-hospitals'] as const;

export function portalHospitalsQueryOptions() {
  return queryOptions({
    queryKey: portalHospitalsQueryKey,
    queryFn: getPortalHospitals,
    retry: false,
  });
}

export const hospitalScopedQueryKey = ['hospital-scope'] as const;

export const dashboardQueryKey = ['dashboard-summary'] as const;

export function dashboardQueryOptions(activeHospitalId: string) {
  return queryOptions({
    queryKey: [...dashboardQueryKey, activeHospitalId],
    queryFn: getDashboardSummary,
    retry: false,
  });
}

export const adminHospitalsQueryKey = ['admin-hospitals'] as const;

export function adminHospitalsQueryOptions(
  params: AdminHospitalsParams,
) {
  return queryOptions({
    queryKey: [...adminHospitalsQueryKey, params],
    queryFn: () => getAdminHospitals(params),
    placeholderData: (previousData) => previousData,
  });
}

export const adminUsersQueryKey = ['admin-users'] as const;

export const statusMappingsQueryKey = ['status-mappings'] as const;

export function statusMappingsQueryOptions(params: StatusMappingsParams) {
  return queryOptions({
    queryKey: [...statusMappingsQueryKey, params],
    queryFn: () => getStatusMappings(params),
    placeholderData: (previousData) => previousData,
  });
}

export function adminUsersQueryOptions(params: AdminUsersParams) {
  return queryOptions({
    queryKey: [...adminUsersQueryKey, params],
    queryFn: () => getAdminUsers(params),
    placeholderData: (previousData) => previousData,
  });
}

export const adminAuditQueryKey = ['admin-audit'] as const;

export function adminAuditQueryOptions(params: AuditParams) {
  return queryOptions({
    queryKey: [...adminAuditQueryKey, params],
    queryFn: () => getAdminAudit(params),
    placeholderData: (previousData) => previousData,
  });
}

export const adminEmailsQueryKey = ['admin-emails'] as const;

export function adminEmailsQueryOptions(params: AdminEmailsParams) {
  return queryOptions({
    queryKey: [...adminEmailsQueryKey, params],
    queryFn: () => getAdminEmails(params),
    placeholderData: (previousData) => previousData,
  });
}

export const devicesQueryKey = ['devices'] as const;

export function devicesQueryOptions(
  activeHospitalId: string,
  params: DevicesParams,
) {
  return queryOptions({
    queryKey: [...devicesQueryKey, activeHospitalId, params],
    queryFn: () => getDevices(params),
    placeholderData: (previousData) => previousData,
  });
}

export function deviceQueryOptions(activeHospitalId: string, id: string) {
  return queryOptions({
    queryKey: [...devicesQueryKey, activeHospitalId, 'details', id],
    queryFn: () => getDevice(id),
    retry: (count, error) =>
      error instanceof Error &&
      'status' in error &&
      Number((error as { status: number }).status) >= 500 &&
      count < 2,
  });
}

export const departmentsQueryKey = ['departments'] as const;

export const repairsQueryKey = ['repairs'] as const;

export function repairsQueryOptions(
  activeHospitalId: string,
  params: RepairsParams,
) {
  return queryOptions({
    queryKey: [...repairsQueryKey, activeHospitalId, params],
    queryFn: () => getRepairs(params),
    placeholderData: (previousData) => previousData,
  });
}

export function repairQueryOptions(activeHospitalId: string, id: string) {
  return queryOptions({
    queryKey: [...repairsQueryKey, activeHospitalId, 'details', id],
    queryFn: () => getRepair(id),
    retry: (count, error) =>
      error instanceof Error &&
      'status' in error &&
      Number((error as { status: number }).status) >= 500 &&
      count < 2,
  });
}

export const inspectionsQueryKey = ['inspections'] as const;

export function inspectionsQueryOptions(
  activeHospitalId: string,
  params: InspectionsParams,
) {
  return queryOptions({
    queryKey: [...inspectionsQueryKey, activeHospitalId, params],
    queryFn: () => getInspections(params),
    placeholderData: (previousData) => previousData,
  });
}

export function inspectionQueryOptions(activeHospitalId: string, id: string) {
  return queryOptions({
    queryKey: [...inspectionsQueryKey, activeHospitalId, 'details', id],
    queryFn: () => getInspection(id),
    retry: (count, error) =>
      error instanceof Error &&
      'status' in error &&
      Number((error as { status: number }).status) >= 500 &&
      count < 2,
  });
}

export function departmentsQueryOptions(activeHospitalId: string) {
  return queryOptions({
    queryKey: [...departmentsQueryKey, activeHospitalId],
    queryFn: getDepartments,
  });
}
