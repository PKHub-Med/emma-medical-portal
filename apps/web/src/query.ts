import {
  queryOptions,
  useQuery,
} from '@tanstack/react-query';
import {
  getAdminHospitals,
  getCurrentUser,
  type AdminHospitalsParams,
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
