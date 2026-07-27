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
