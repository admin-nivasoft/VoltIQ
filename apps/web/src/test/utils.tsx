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

// ---- fixtures and a path-based API stub for the fleet screen ----
import type { Alert, FleetSummary, PackSummary } from '@ql/contracts';

export const makeSummary = (over: Partial<FleetSummary> = {}): FleetSummary => ({
  packsInService: 37,
  averageSohPct: 91.8,
  activeAlerts: 6,
  packsNearingEol: 7,
  asOf: new Date().toISOString(),
  ...over,
});

export const makePack = (n: number, over: Partial<PackSummary> = {}): PackSummary => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  serial: `QL-A-${String(n).padStart(4, '0')}`,
  spec: 'LFP-48V-100Ah',
  assetId: `ASSET-A-${String(n).padStart(3, '0')}`,
  status: 'in_service',
  warrantyStatus: 'active',
  sohPct: 90 - n / 10,
  trend: { direction: 'stable', pointsPer30Days: -0.1 },
  remainingLife: { monthsLow: 8, monthsHigh: 12, confidence: 0.82 },
  modelVersion: 'ql-health-1.3.0',
  recordedAt: new Date().toISOString(),
  ...over,
});

export const makeAlert = (n: number, over: Partial<Alert> = {}): Alert => ({
  id: `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`,
  packId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  packSerial: `QL-A-${String(n).padStart(4, '0')}`,
  severity: 'high',
  title: `Battery health is dropping faster than expected ${n}`,
  description: 'This pack has lost capacity quickly over the last few weeks.',
  recommendedAction: 'Arrange an inspection within 7 days.',
  status: 'open',
  createdAt: '2026-11-10T09:30:00.000Z',
  acknowledgedBy: null,
  acknowledgedAt: null,
  modelVersion: 'ql-health-1.3.0',
  confidence: 0.8,
  signals: null,
  ...over,
});

export const page = <T,>(items: T[], total = items.length, p = 1, pageSize = 25) => ({
  items,
  total,
  page: p,
  pageSize,
  asOf: new Date().toISOString(),
});

type Reply = { status?: number; body?: unknown };
type Route = Reply | ((url: URL, init: RequestInit) => Reply | Promise<Reply>);

/** Answers by `METHOD /path` (without /api/v1). Unknown routes are a 404 so a test never talks to a real server. */
export function stubApi(routes: Record<string, Route>) {
  return stubFetch(async (raw, init) => {
    const url = new URL(raw, 'http://localhost');
    const key = `${init.method ?? 'GET'} ${url.pathname.replace(/^\/api\/v1/, '')}`;
    const route = routes[key];
    if (!route)
      return { status: 404, body: { error: { code: 'not_found', message: `no stub for ${key}` } } };
    return typeof route === 'function' ? route(url, init) : route;
  });
}

/** Switches the media query used for the table/cards swap. */
export function setViewport(kind: 'phone' | 'desktop') {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: kind === 'desktop',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  }));
}
