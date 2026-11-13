import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { Me, Role } from '@ql/contracts';
import policy from '../../../../config/permissions.json';

const NAMES: Record<Role, string> = {
  fleet_manager: 'Fleet Manager A',
  technician: 'Technician A',
  consumer_admin: 'Admin A',
  platform_admin: 'Platform Admin',
};

/** A /me payload built from the real starting policy, so tests use the permissions the API would grant. */
export function makeMe(role: Role = 'fleet_manager', over: Partial<Me> = {}): Me {
  const platform = role === 'platform_admin';
  return {
    user: { id: '11111111-1111-4111-8111-111111111111', name: NAMES[role], role },
    consumer: platform
      ? null
      : { id: '22222222-2222-4222-8222-222222222222', name: 'Aurora Motors (OEM)', type: 'oem' },
    manufacturer: platform ? null : { name: '82 Volts', logoUrl: '/assets/82volts-logo.svg' },
    permissions: (policy.roles as Record<string, string[]>)[role] as Me['permissions'],
    asOf: new Date().toISOString(),
    ...over,
  };
}

/** A client that never refetches on its own, so seeded data stays put during a test. */
export function testClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchInterval: false } },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  opts: { me?: Me | null; route?: string; client?: QueryClient } = {},
) {
  const client = opts.client ?? testClient();
  if ('me' in opts) client.setQueryData(['me'], opts.me);
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[opts.route ?? '/']}>{ui}</MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

/** Replaces fetch with a stub that answers by path. Returns the spy so tests can inspect calls. */
export function stubFetch(
  handler: (
    url: string,
    init: RequestInit,
  ) => { status?: number; body?: unknown } | Promise<{ status?: number; body?: unknown }>,
) {
  const spy = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const r = await handler(String(input), init);
    const status = r.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(r.body ?? {}), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

/** The calls a stubbed fetch received, as [url, init] with init always defined. */
export const callsOf = (spy: ReturnType<typeof stubFetch>) =>
  spy.mock.calls.map(([url, init]) => [String(url), (init ?? {}) as RequestInit] as const);
