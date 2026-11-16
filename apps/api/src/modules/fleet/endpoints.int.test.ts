import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AlertPageSchema,
  AlertSchema,
  FleetSummarySchema,
  PackPageSchema,
  type Alert,
} from '@ql/contracts';
import { buildApp } from '../../app.ts';
import { loadConfig } from '../../config.ts';
import {
  createAppStateRepository,
  createPool,
  createPostgresMockSource,
  withTenant,
  type Pool,
} from '../../data/index.ts';
import { CONSUMERS, startTestDb, type TestDb } from '../../data/testing/db.ts';

const H = { 'x-requested-with': 'ql' };
const U = {
  fleetA: 'e0000001-0000-4000-8000-000000000001',
  techA: 'e0000001-0000-4000-8000-000000000002',
  adminA: 'e0000001-0000-4000-8000-000000000003',
  fleetB: 'e0000002-0000-4000-8000-000000000001',
  fleetC: 'e0000003-0000-4000-8000-000000000001',
  platform: 'd0000000-0000-4000-8000-000000000001',
};
const ROLE_USERS = {
  fleet_manager: U.fleetA,
  technician: U.techA,
  consumer_admin: U.adminA,
  platform_admin: U.platform,
} as const;

let db: TestDb;
let pool: Pool;
let app: FastifyInstance;
const cookies: Record<string, string> = {};

const login = async (userId: string) => {
  const r = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/mock-login',
    headers: H,
    payload: { userId },
  });
  expect(r.statusCode).toBe(200);
  return String(r.headers['set-cookie']).split(';')[0] as string;
};
const get = (url: string, who: keyof typeof cookies | null, extra: Record<string, string> = {}) =>
  app.inject({
    method: 'GET',
    url: `/api/v1${url}`,
    headers: { ...(who ? { cookie: cookies[who] as string } : {}), ...extra },
  });
const post = (url: string, who: keyof typeof cookies | null, headers: Record<string, string> = H) =>
  app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    headers: { ...(who ? { cookie: cookies[who] as string } : {}), ...headers },
  });

const alertsOf = async (who: string, qs = '') =>
  AlertPageSchema.parse((await get(`/alerts?pageSize=100${qs}`, who)).json()).items;

beforeAll(async () => {
  db = await startTestDb();
  pool = createPool(db.appUrl);
  const config = loadConfig({
    NODE_ENV: 'test',
    AUTH_PROVIDER: 'mock',
    ENABLE_DEV_ENDPOINTS: 'true',
    JWT_SECRET: 's'.repeat(48),
    DATABASE_URL: db.appUrl,
    RATE_LIMIT_PER_MINUTE: '100000',
  } as NodeJS.ProcessEnv);
  app = await buildApp({
    config,
    repo: createAppStateRepository(pool),
    fleet: createPostgresMockSource(pool, config),
  });
  for (const [k, id] of Object.entries(U)) cookies[k] = await login(id);
});
afterAll(async () => {
  await app?.close();
  await pool?.end();
  await db?.stop();
});

describe('permissions for every endpoint and role (D-01)', () => {
  const reads = ['/fleet/summary', '/packs', '/alerts'];
  it.each(Object.entries(ROLE_USERS))('%s on read endpoints', async (role, userId) => {
    const who = Object.keys(U).find((k) => U[k as keyof typeof U] === userId)!;
    for (const url of reads) {
      const r = await get(url, who);
      expect(r.statusCode, `${role} ${url}`).toBe(role === 'platform_admin' ? 403 : 200);
      if (r.statusCode === 403) expect(r.json().error.code).toBe('forbidden');
    }
  });

  it('signed-out requests get 401 on every endpoint', async () => {
    for (const url of reads) expect((await get(url, null)).statusCode, url).toBe(401);
    const some = (await alertsOf('fleetA'))[0]!;
    expect((await post(`/alerts/${some.id}/acknowledge`, null)).statusCode).toBe(401);
  });

  it('acknowledge: fleet_manager and consumer_admin may, technician and platform_admin may not', async () => {
    const open = await alertsOf('fleetA', '&status=open');
    expect(open.length).toBeGreaterThanOrEqual(4);
    expect((await post(`/alerts/${open[0]!.id}/acknowledge`, 'fleetA')).statusCode).toBe(200);
    expect((await post(`/alerts/${open[1]!.id}/acknowledge`, 'adminA')).statusCode).toBe(200);
    for (const who of ['techA', 'platform']) {
      const r = await post(`/alerts/${open[2]!.id}/acknowledge`, who);
      expect(r.statusCode, who).toBe(403);
    }
    // The technician's refused attempt changed nothing.
    expect((await alertsOf('fleetA', '&status=open')).map((a) => a.id)).toContain(open[2]!.id);
  });
});

describe('acknowledge (D-10, D-13)', () => {
  it("another consumer's alert is a 404, and stays open; a technician is refused before existence is revealed", async () => {
    const bOpen = (await alertsOf('fleetB', '&status=open'))[0]!;
    const r = await post(`/alerts/${bOpen.id}/acknowledge`, 'fleetA');
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ error: { code: 'not_found', message: expect.any(String) } });
    expect((await alertsOf('fleetB', '&status=open')).map((a) => a.id)).toContain(bOpen.id);
    expect((await post(`/alerts/${bOpen.id}/acknowledge`, 'techA')).statusCode).toBe(403);
    expect(
      (await post('/alerts/99999999-9999-4999-8999-999999999999/acknowledge', 'fleetA')).statusCode,
    ).toBe(404);
  });

  it('lowers the active count, records who and when, and a repeat is an idempotent 200', async () => {
    const before = FleetSummarySchema.parse(
      (await get('/fleet/summary', 'fleetA')).json(),
    ).activeAlerts;
    const target = (await alertsOf('fleetA', '&status=open'))[0]!;
    const first = await post(`/alerts/${target.id}/acknowledge`, 'fleetA');
    expect(first.statusCode).toBe(200);
    const a1 = AlertSchema.parse(first.json());
    expect(a1).toMatchObject({ status: 'acknowledged', acknowledgedBy: 'Fleet Manager A' });
    expect(
      FleetSummarySchema.parse((await get('/fleet/summary', 'fleetA')).json()).activeAlerts,
    ).toBe(before - 1);
    const again = await post(`/alerts/${target.id}/acknowledge`, 'adminA');
    expect(again.statusCode).toBe(200);
    const a2 = AlertSchema.parse(again.json());
    expect(a2.acknowledgedBy).toBe(a1.acknowledgedBy);
    expect(a2.acknowledgedAt).toBe(a1.acknowledgedAt);
    expect(
      FleetSummarySchema.parse((await get('/fleet/summary', 'fleetA')).json()).activeAlerts,
    ).toBe(before - 1);
  });

  it('a resolved alert returns 409', async () => {
    const resolved = (await alertsOf('fleetA', '&status=resolved'))[0]!;
    const r = await post(`/alerts/${resolved.id}/acknowledge`, 'fleetA');
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe('conflict');
  });

  it('needs X-Requested-With, and a malformed id is a 400', async () => {
    const target = (await alertsOf('fleetA', '&status=open'))[0]!;
    expect((await post(`/alerts/${target.id}/acknowledge`, 'fleetA', {})).statusCode).toBe(403);
    expect((await post('/alerts/not-a-uuid/acknowledge', 'fleetA')).statusCode).toBe(400);
  });

  it('writes an audit event for the acknowledging user', async () => {
    const target = (await alertsOf('fleetA', '&status=open'))[0]!;
    await post(`/alerts/${target.id}/acknowledge`, 'adminA');
    const n = await withTenant(
      pool,
      CONSUMERS.A,
      async (tx) =>
        (
          await tx.query(
            "SELECT count(*)::int AS n FROM audit_events WHERE action = 'alert.acknowledge' AND object = $1 AND user_id = $2",
            [`alert:${target.id}`, U.adminA],
          )
        ).rows[0]?.n,
    );
    expect(n).toBe(1);
  });
});

describe('query validation', () => {
  it.each([
    '/packs?sort=password',
    '/packs?sort=serial:up',
    '/packs?pageSize=101',
    '/packs?page=0',
    '/packs?page=abc',
    `/packs?q=${'x'.repeat(101)}`,
    '/alerts?sort=packId',
    '/alerts?severity=urgent',
    '/alerts?status=deleted',
    '/alerts?pageSize=-1',
  ])('%s is a 400 with the error envelope', async (url) => {
    const r = await get(url, 'fleetA');
    expect(r.statusCode, url).toBe(400);
    expect(r.json().error.code).toBe('validation_failed');
    expect(r.body).not.toMatch(/select |from |packs where|stack/i);
  });

  it('lists page, sort and filter correctly', async () => {
    const p1 = PackPageSchema.parse(
      (await get('/packs?pageSize=10&page=1&sort=sohPct:desc', 'techA')).json(),
    );
    expect(p1).toMatchObject({ total: 40, page: 1, pageSize: 10 });
    expect(p1.items).toHaveLength(10);
    const sohs = p1.items.map((p) => p.sohPct!);
    expect(sohs).toEqual([...sohs].sort((a, b) => b - a));
    const high = await alertsOf('techA', '&severity=high');
    expect(high.length).toBeGreaterThan(0);
    expect(high.every((a) => a.severity === 'high')).toBe(true);
  });
});

describe('canary crawl (D-12): signed in as A, no B or C identifier appears anywhere', () => {
  it('every GET endpoint, with every query variant', async () => {
    // Everything that identifies B or C, gathered by signing in as them.
    const forbidden = new Set<string>([
      CONSUMERS.B,
      CONSUMERS.C,
      'CANARY',
      'QL-B-',
      'QL-C-',
      'ASSET-B-',
      'ASSET-C-',
      '.b@example.test',
      '.c@example.test',
      'Fleet Manager B',
      'Fleet Manager C',
      'Technician B',
      'Technician C',
      'Admin B',
      'Admin C',
      'e0000002-0000-4000-8000-000000000003',
      'e0000003-0000-4000-8000-000000000003',
    ]);
    const bSerials: string[] = [];
    for (const who of ['fleetB', 'fleetC']) {
      // Page until total is reached, so the deny-list stays complete if the seed grows.
      for (let page = 1; ; page++) {
        const packs = PackPageSchema.parse(
          (await get(`/packs?pageSize=100&page=${page}`, who)).json(),
        );
        packs.items.forEach((p) => forbidden.add(p.id));
        if (who === 'fleetB' && page === 1)
          bSerials.push(...packs.items.slice(0, 3).map((p) => p.serial));
        if (page * 100 >= packs.total) break;
      }
      for (let page = 1; ; page++) {
        const alerts = AlertPageSchema.parse(
          (await get(`/alerts?pageSize=100&page=${page}`, who)).json(),
        );
        alerts.items.forEach((a: Alert) => forbidden.add(a.id));
        if (page * 100 >= alerts.total) break;
      }
    }
    expect(forbidden.size).toBeGreaterThan(80);
    [
      U.fleetB,
      U.fleetC,
      'e0000002-0000-4000-8000-000000000002',
      'e0000003-0000-4000-8000-000000000002',
    ].forEach((id) => forbidden.add(id));

    const paths: string[] = ['/me', '/fleet/summary', '/openapi.json'];
    const spoof = ['', `&consumerId=${CONSUMERS.B}`, `&consumer_id=${CONSUMERS.C}`];
    for (const s of spoof) {
      paths.push(`/me?x=1${s}`, `/fleet/summary?x=1${s}`);
      for (const sort of [
        '',
        ...['serial', 'sohPct', 'trend', 'remainingLife', 'warrantyStatus'].flatMap((f) => [
          `&sort=${f}`,
          `&sort=${f}:asc`,
          `&sort=${f}:desc`,
        ]),
      ]) {
        for (const page of [1, 2, 3, 4]) paths.push(`/packs?pageSize=10&page=${page}${sort}${s}`);
      }
      paths.push(`/packs?pageSize=100${s}`);
      paths.push(
        `/packs?pageSize=5&page=2&sort=trend:desc&q=QL${s}`,
        `/alerts?pageSize=5&page=2&status=open&severity=high&sort=severity:asc${s}`,
      );
      for (const q of [
        'QL-A',
        'QL-B-0001',
        'QL-C-0001',
        'CANARY',
        'CANARY-CONSUMER-B',
        '%',
        '_',
        'B',
        'ASSET',
        ...bSerials,
        CONSUMERS.B,
        CONSUMERS.C,
      ]) {
        paths.push(`/packs?pageSize=100&q=${encodeURIComponent(q)}${s}`);
      }
      for (const status of ['', 'open', 'acknowledged', 'resolved']) {
        for (const severity of ['', 'high', 'medium', 'low']) {
          paths.push(
            `/alerts?pageSize=100${status ? `&status=${status}` : ''}${severity ? `&severity=${severity}` : ''}${s}`,
          );
        }
      }
      for (const f of ['createdAt', 'severity', 'status'])
        for (const d of ['asc', 'desc']) paths.push(`/alerts?pageSize=10&sort=${f}:${d}${s}`);
    }

    let ok = 0;
    for (const who of ['fleetA', 'techA', 'adminA']) {
      for (const p of paths) {
        for (const extra of [{}, { 'x-consumer-id': CONSUMERS.B }] as Record<string, string>[]) {
          const r = await get(p, who, extra);
          expect(r.statusCode, `${who} ${p}`).toBe(200);
          ok++;
          for (const f of forbidden) {
            if (r.body.includes(f)) throw new Error(`${who} GET ${p} leaked ${JSON.stringify(f)}`);
          }
        }
      }
    }
    expect(ok).toBeGreaterThan(1500);
    // The crawl is only meaningful if A's own data was actually returned.
    expect((await get('/packs?pageSize=100', 'fleetA')).body).toContain('QL-A-0001');
  });
});

describe('OpenAPI', () => {
  it('is served at /api/v1/openapi.json without sign-in', async () => {
    const r = await get('/openapi.json', null);
    expect(r.statusCode).toBe(200);
    const doc = r.json();
    expect(doc.openapi).toMatch(/^3\.1/);
    expect(Object.keys(doc.paths).sort()).toEqual([
      '/admin/permissions',
      '/alerts',
      '/alerts/{id}/acknowledge',
      '/fleet/summary',
      '/me',
      '/notification-channels',
      '/notification-channels/test',
      '/notification-log',
      '/packs',
    ]);
    expect(JSON.stringify(doc)).not.toMatch(/mock-login|\/dev\/|supplier|cohort|cell[\s_-]?lot/i);
  });

  it('every documented operation is a registered route', async () => {
    const doc = (await get('/openapi.json', null)).json();
    for (const [path, ops] of Object.entries<Record<string, unknown>>(doc.paths)) {
      for (const method of Object.keys(ops)) {
        const url = `/api/v1${path.replace('{id}', ':id')}`;
        expect(
          app.hasRoute({ method: method.toUpperCase() as 'GET' | 'POST', url }),
          `${method} ${url}`,
        ).toBe(true);
      }
    }
  });
});

describe('route inventory and edge cases', () => {
  const PUBLIC = new Set([
    '/api/v1/auth/mock-login',
    '/api/v1/auth/logout',
    '/api/v1/openapi.json',
    '/api/v1/me',
  ]);

  it('every /api/v1 route is documented in OpenAPI and (except sign-in, sign-out, /me and the spec) permission-guarded', async () => {
    const doc = (await get('/openapi.json', null)).json();
    const documented = new Set(
      Object.entries<Record<string, unknown>>(doc.paths).flatMap(([path, ops]) =>
        Object.keys(ops).map((m) => `${m.toUpperCase()} /api/v1${path.replace('{id}', ':id')}`),
      ),
    );
    const routes = app.routeInventory.filter(
      (r) => r.url.startsWith('/api/v1') && r.method !== 'HEAD',
    );
    expect(routes.length).toBeGreaterThanOrEqual(7);
    for (const r of routes) {
      if (PUBLIC.has(r.url)) continue;
      if (r.url.startsWith('/api/v1/dev/')) {
        // Mock-only routes are deliberately undocumented, but must be guarded.
        expect(r.guarded, `${r.method} ${r.url} has no preHandler guard`).toBe(true);
        continue;
      }
      expect(documented.has(`${r.method} ${r.url}`), `${r.method} ${r.url} is not documented`).toBe(
        true,
      );
      expect(r.guarded, `${r.method} ${r.url} has no preHandler guard`).toBe(true);
    }
  });

  it('a technician is refused before the id is validated or looked up', async () => {
    expect((await post('/alerts/not-a-uuid/acknowledge', 'techA')).statusCode).toBe(403);
    expect(
      (await post('/alerts/99999999-9999-4999-8999-999999999999/acknowledge', 'techA')).statusCode,
    ).toBe(403);
  });

  it('acknowledge ignores a body naming another consumer or user', async () => {
    const target = (await alertsOf('fleetA', '&status=open'))[0]!;
    const r = await app.inject({
      method: 'POST',
      url: `/api/v1/alerts/${target.id}/acknowledge`,
      headers: {
        ...H,
        cookie: cookies.fleetA as string,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ consumerId: CONSUMERS.B, userId: U.fleetB }),
    });
    expect(r.statusCode).toBe(200);
    expect(AlertSchema.parse(r.json()).acknowledgedBy).toBe('Fleet Manager A');
    const n = await withTenant(
      pool,
      CONSUMERS.A,
      async (tx) =>
        (
          await tx.query(
            "SELECT user_id FROM audit_events WHERE action = 'alert.acknowledge' AND object = $1",
            [`alert:${target.id}`],
          )
        ).rows,
    );
    expect(n.map((x) => x.user_id)).toEqual([U.fleetA]);
  });

  it('HEAD is guarded like GET', async () => {
    const head = (who: string | null) =>
      app.inject({
        method: 'HEAD',
        url: '/api/v1/packs',
        headers: who ? { cookie: cookies[who] as string } : {},
      });
    expect((await head(null)).statusCode).toBe(401);
    expect((await head('platform')).statusCode).toBe(403);
    expect((await head('fleetA')).statusCode).toBe(200);
  });

  it.each([
    '/api/v1/PACKS',
    '/api/v1/packs/',
    '/api/v1//packs',
    '/api/v1/Packs',
    '/api/v1/packs/..%2Falerts',
  ])('%s is a 404 with no data', async (url) => {
    const r = await app.inject({
      method: 'GET',
      url,
      headers: { cookie: cookies.fleetA as string },
    });
    expect(r.statusCode, url).toBe(404);
    expect(r.body).not.toContain('QL-A-');
  });

  it('the per-user rate limit applies to /packs', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      AUTH_PROVIDER: 'mock',
      ENABLE_DEV_ENDPOINTS: 'true',
      JWT_SECRET: 's'.repeat(48),
      DATABASE_URL: db.appUrl,
      RATE_LIMIT_PER_MINUTE: '5',
    } as NodeJS.ProcessEnv);
    const limited = await buildApp({
      config,
      repo: createAppStateRepository(pool),
      fleet: createPostgresMockSource(pool, config),
    });
    const l = await limited.inject({
      method: 'POST',
      url: '/api/v1/auth/mock-login',
      headers: H,
      payload: { userId: U.fleetA },
    });
    const cookie = String(l.headers['set-cookie']).split(';')[0] as string;
    const codes: number[] = [];
    for (let i = 0; i < 8; i++)
      codes.push(
        (await limited.inject({ method: 'GET', url: '/api/v1/packs', headers: { cookie } }))
          .statusCode,
      );
    expect(codes.slice(0, 4)).toEqual([200, 200, 200, 200]);
    expect(codes).toContain(429);
    await limited.close();
  });
});
