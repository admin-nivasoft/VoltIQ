import { useQuery } from '@tanstack/react-query';
import type { Me, Permission } from '@ql/contracts';
import { api } from '../api/client';

export const ME_KEY = ['me'] as const;

export type Session =
  | { status: 'loading'; me: null; error: null; refetch: () => void }
  | { status: 'error'; me: null; error: unknown; refetch: () => void }
  | { status: 'signedOut'; me: null; error: null; refetch: () => void }
  | { status: 'signedIn'; me: Me; error: null; refetch: () => void };

/**
 * Who is signed in, from GET /me. It is polled with everything else, so permission changes reach the
 * screen. The server stays the authority: what the UI hides is a convenience, not security.
 */
export function useSession(): Session {
  const q = useQuery({ queryKey: ME_KEY, queryFn: api.me });
  const refetch = () => void q.refetch();
  // Data first: a failed background refresh (flaky network, one 5xx) must not blank a signed-in screen.
  if (q.data !== undefined) {
    return q.data
      ? { status: 'signedIn', me: q.data, error: null, refetch }
      : { status: 'signedOut', me: null, error: null, refetch };
  }
  if (q.isPending) return { status: 'loading', me: null, error: null, refetch };
  return { status: 'error', me: null, error: q.error, refetch };
}

/** True only when signed in and holding the permission. False while loading. Never looks at the role name. */
export function useCan(...anyOf: Permission[]): boolean {
  const { me } = useSession();
  return me !== null && anyOf.some((p) => me.permissions.includes(p));
}
