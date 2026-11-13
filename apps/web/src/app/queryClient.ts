import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../lib/api/client';

/** The screen refreshes itself every 30 seconds (plan: polling; server-sent events can follow). */
export const POLL_INTERVAL_MS = 30_000;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchInterval: POLL_INTERVAL_MS,
        refetchIntervalInBackground: false, // a hidden tab does not poll
        refetchOnWindowFocus: true,
        staleTime: 10_000,
        // A refusal will not change by asking again; a server or network blip might.
        retry: (count, err) =>
          !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      },
    },
  });
}
