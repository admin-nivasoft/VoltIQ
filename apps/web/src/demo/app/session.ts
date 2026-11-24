import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch } from '../../lib/api/client';
import { DemoMeSchema, MetricListSchema, type DemoMe, type DemoPermission } from '../types';

export const DEMO_ME_KEY = ['demo', 'me'] as const;

async function fetchMe(): Promise<DemoMe | null> {
  try {
    return await apiFetch('/me', { schema: DemoMeSchema });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export type DemoSession =
  | { status: 'loading' | 'signedOut'; me: null; error: null; refetch: () => void }
  | { status: 'error'; me: null; error: unknown; refetch: () => void }
  | { status: 'signedIn'; me: DemoMe; error: null; refetch: () => void };

/** Who is signed in. A failure to find out is an error, never read as "signed out". */
export function useDemoSession(): DemoSession {
  const q = useQuery({ queryKey: DEMO_ME_KEY, queryFn: fetchMe });
  const refetch = () => void q.refetch();
  if (q.data !== undefined)
    return q.data
      ? { status: 'signedIn', me: q.data, error: null, refetch }
      : { status: 'signedOut', me: null, error: null, refetch };
  if (q.isPending) return { status: 'loading', me: null, error: null, refetch };
  return { status: 'error', me: null, error: q.error, refetch };
}

/** True only when signed in with the permission. What the UI hides is a convenience; the handler checks too. */
export function useDemoCan(permission: DemoPermission): boolean {
  const { me } = useDemoSession();
  return me !== null && me.permissions.includes(permission);
}

export function useSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiFetch('/auth/mock-login', { method: 'POST', body: { userId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEMO_ME_KEY }),
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] === 'demo' && q.queryKey[1] !== 'me' });
      return qc.invalidateQueries({ queryKey: DEMO_ME_KEY });
    },
  });
}

/** The metric dictionary, read once: every "how this is worked out" panel looks its metric up here. */
export function useMetrics() {
  return useQuery({
    queryKey: ['demo', 'metrics'],
    queryFn: () => apiFetch('/metrics', { schema: MetricListSchema }),
    staleTime: Infinity,
  });
}
