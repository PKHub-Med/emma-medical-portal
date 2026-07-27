import {
  queryOptions,
  useQuery,
} from '@tanstack/react-query';
import { getCurrentUser } from './api';

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
