// Central TanStack Query client (REMEDIATION.md §6.3). One instance, created
// once at module scope so it survives re-renders of the root layout and can
// be imported directly by non-component code (e.g. a mutation queue flush).
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/services/api';

function isRetryable(error: unknown): boolean {
  // A validation/auth/not-found response (4xx) will never succeed on retry —
  // only retry transient failures: network drops, timeouts, and 5xx.
  if (error instanceof ApiError) {
    if (error.statusCode === null) return true; // NETWORK_ERROR / TIMEOUT
    return error.statusCode >= 500;
  }
  return false;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: (failureCount, error) => failureCount < 2 && isRetryable(error),
      refetchOnReconnect: true,
    },
    mutations: {
      // Each mutation call site opts into retry deliberately (e.g. queued
      // offline writes); a bare default retry would re-fire non-idempotent
      // writes like `createJoinRequest` on transient errors.
      retry: false,
    },
  },
});
