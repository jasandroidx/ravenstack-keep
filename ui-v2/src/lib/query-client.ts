import { QueryClient } from "@tanstack/react-query";

/**
 * One client for the whole app so a snapshot fetched on one route is still
 * warm when the next route mounts the same query — no re-fetch flash, no
 * "pulse…" reappearing just because you clicked a nav link.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      refetchInterval: 15000,
      retry: 1,
    },
  },
});
