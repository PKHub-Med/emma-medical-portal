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
    staleTime: 30_000,
  });
}

export function useCurrentUser() {
  return useQuery(currentUserQueryOptions());
}
