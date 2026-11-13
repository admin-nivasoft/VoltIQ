import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MeSchema, type RolePolicy } from '@ql/contracts';
import policyFile from '../../../../../config/permissions.json';
import { buildApp } from '../../app.ts';
import { loadConfig } from '../../config.ts';
import { createPostgresMockSource } from '../adapters/postgres-mock.ts';
import { createAppStateRepository } from '../app-state.ts';
import { createPool } from '../pool.ts';
import { withTenant } from '../tenant.ts';
import { CONSUMERS, startTestDb, type TestDb } from '../testing/db.ts';

const policy = policyFile as RolePolicy;
const H = { 'x-requested-with': 'ql' };
const USERS = {
  fleetA: 'e0000001-0000-4000-8000-000000000001',
  techA: 'e0000001-0000-4000-8000-000000000002',
  adminA: 'e0000001-0000-4000-8000-000000000003',
  fleetB: 'e0000002-0000-4000-8000-000000000001',
  techC: 'e0000003-0000-4000-8000-000000000002',
  platform: 'd0000000-0000-4000-8000-000000000001',
};

let db: TestDb;
let pool: pg.Pool;
const env = (o: Record<string, string> = {}) => ({
  NODE_ENV: 'test',
  AUTH_PROVIDER: 'mock',
  ENABLE_DEV_ENDPOINTS: 'true',
  JWT_SECRET: 's'.repeat(48),
  DATABASE_URL: db.appUrl,
  ...o,
});
const app = async (o: Record<string, string> = {}): Promise<FastifyInstance> =>
  buildApp({
    config: loadConfig(env(o) as NodeJS.ProcessEnv),
    repo: createAppStateRepository(pool),
    fleet: createPostgresMockSource(pool, loadConfig(env() as NodeJS.ProcessEnv)),
  });

const login = async (a: FastifyInstance, userId: string) => {
  const r = await a.inject({
    method: 'POST',
    url: '/api/v1/auth/mock-login',
    headers: H,
    payload: { userId },
  });
  const cookie = String(r.headers['set-cookie'] ?? '').split(';')[0] ?? '';
  return { r, cookie };
};

beforeAll(async () => {
  db = await startTestDb();
  pool = createPool(db.appUrl);
});
afterAll(async () => {
  await pool?.end();
  await db?.stop();
});

describe('login and /me', () => {
  it.each([
    ['fleet_manager', USERS.fleetA, 'A'],
    ['technician', USERS.techA, 'A'],
    ['consumer_admin', USERS.adminA, 'A'],
    ['fleet_manager', USERS.fleetB, 'B'],
    ['technician', USERS.techC, 'C'],
  ])('%s %s returns the right permissions and consumer', async (role, userId, code) => {
    const a = await app();
    const { r, cookie } = await login(a, userId);
    expect(r.statusCode).toBe(200);
    const me = await a.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    const body = MeSchema.parse(me.json());
    expect(body.user.role).toBe(role);
    expect(body.consumer?.id).toBe(CONSUMERS[code as 'A' | 'B' | 'C']);
    expect(body.manufacturer?.name).toBe('82 Volts');
    expect([...body.permissions].sort()).toEqual(
      [...policy.roles[role as keyof RolePolicy['roles']]].sort(),
    );
    await a.close();
  });

  it('platform_admin has no consumer and only permissions.manage', async () => {
    const a = await app();
    const { cookie } = await login(a, USERS.platform);
    const body = MeSchema.parse(
      (await a.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } })).json(),
    );
    expect(body.consumer).toBeNull();
    expect(body.manufacturer).toBeNull();
    expect(body.permissions).toEqual(['permissions.manage']);
    await a.close();
  });

  it('the login cookie is httpOnly, SameSite=Strict, and Secure except on localhost', async () => {
    const a = await app();
    const local = await a.inject({
      method: 'POST',
      url: '/api/v1/auth/mock-login',
      headers: { ...H, host: 'localhost:8080' },
      payload: { userId: USERS.fleetA },
    });
    const lc = String(local.headers['set-cookie']);
    expect(lc).toMatch(/HttpOnly/i);
    expect(lc).toMatch(/SameSite=Strict/i);
    expect(lc).not.toMatch(/Secure/i);
    const remote = await a.inject({
      method: 'POST',
      url: '/api/v1/auth/mock-login',
      headers: { ...H, host: 'portal.example.com' },
      payload: { userId: USERS.fleetA },
    });
    expect(String(remote.headers['set-cookie'])).toMatch(/Secure/i);
    await a.close();
  });

  it('records a login audit event for the consumer', async () => {
    const a = await app();
    await login(a, USERS.techA);
    const n = await withTenant(
      pool,
      CONSUMERS.A,
      async (tx) =>
        (
          await tx.query(
            "SELECT count(*)::int AS n FROM audit_events WHERE action = 'login' AND user_id = $1",
            [USERS.techA],
          )
        ).rows[0],
    );
    expect(n?.n).toBeGreaterThanOrEqual(1);
    await a.close();
  });

  it('an unknown user cannot log in', async () => {
    const a = await app();
    const { r } = await login(a, '99999999-9999-4999-8999-999999999999');
    expect(r.statusCode).toBe(401);
    expect(r.headers['set-cookie']).toBeUndefined();
    await a.close();
  });
});

describe('mock features fail closed (D-08)', () => {
  it.each([
    ['ENABLE_DEV_ENDPOINTS=false', { ENABLE_DEV_ENDPOINTS: 'false' }],
    ['ENABLE_DEV_ENDPOINTS unset', { ENABLE_DEV_ENDPOINTS: '' }],
  ])('mock-login returns 404 with %s', async (_n, o) => {
    const e = env(o) as Record<string, string>;
    if (!e.ENABLE_DEV_ENDPOINTS) delete e.ENABLE_DEV_ENDPOINTS;
    const a = await buildApp({
      config: loadConfig(e as NodeJS.ProcessEnv),
      repo: createAppStateRepository(pool),
      fleet: createPostgresMockSource(pool, loadConfig(env() as NodeJS.ProcessEnv)),
    });
    const r = await a.inject({
      method: 'POST',
      url: '/api/v1/auth/mock-login',
      headers: H,
      payload: { userId: USERS.fleetA },
    });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ error: { code: 'not_found', message: expect.any(String) } });
    await a.close();
  });
});

describe('token handling: the consumer comes from the verified token only', () => {
  it('ignores consumerId in the query string and headers', async () => {
    const a = await app();
    const { cookie } = await login(a, USERS.techA);
    for (const url of [
      `/api/v1/me?consumerId=${CONSUMERS.B}`,
      `/api/v1/me?consumer_id=${CONSUMERS.C}`,
    ]) {
      const me = MeSchema.parse(
        (
          await a.inject({ method: 'GET', url, headers: { cookie, 'x-consumer-id': CONSUMERS.B } })
        ).json(),
      );
      expect(me.consumer?.id).toBe(CONSUMERS.A);
    }
    await a.close();
  });

  it('rejects requests with no cookie, garbage, a wrong-secret token, alg none and an expired token', async () => {
    const a = await app();
    const { SignJWT } = await import('jose');
    const forge = (secret: string, exp: string | number, extra = {}) =>
      new SignJWT({ cid: CONSUMERS.B, role: 'fleet_manager', ...extra })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(USERS.fleetB)
        .setIssuer('ql')
        .setIssuedAt()
        .setExpirationTime(exp)
        .sign(new TextEncoder().encode(secret));
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: USERS.fleetB, cid: CONSUMERS.B, role: 'fleet_manager' })).toString('base64url')}.`;
    const attempts = [
      undefined,
      'ql_session=garbage',
      `ql_session=${await forge('w'.repeat(48), '1h')}`,
      `ql_session=${none}`,
      `ql_session=${await forge('s'.repeat(48), Math.floor(Date.now() / 1000) - 60)}`,
    ];
    for (const cookie of attempts) {
      const r = await a.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: cookie ? { cookie } : {},
      });
      expect(r.statusCode, String(cookie).slice(0, 30)).toBe(401);
      expect(r.json().error.code).toBe('unauthenticated');
    }
    await a.close();
  });

  it('a validly signed token whose claims disagree with the database is rejected', async () => {
    const a = await app();
    const { SignJWT } = await import('jose');
    // Signed with the real secret but claims B's consumer for A's user: must not grant access to B.
    const t = await new SignJWT({ cid: CONSUMERS.B, role: 'fleet_manager' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(USERS.techA)
      .setIssuer('ql')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('s'.repeat(48)));
    const r = await a.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: `ql_session=${t}` },
    });
    expect(r.statusCode).toBe(401);
    await a.close();
  });

  it('logout clears the cookie', async () => {
    const a = await app();
    const { cookie } = await login(a, USERS.fleetA);
    const r = await a.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { ...H, cookie },
    });
    expect(r.statusCode).toBe(204);
    expect(String(r.headers['set-cookie'])).toMatch(
      /ql_session=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i,
    );
    await a.close();
  });
});

describe('request hardening', () => {
  it('state-changing requests need X-Requested-With: ql', async () => {
    const a = await app();
    const r = await a.inject({
      method: 'POST',
      url: '/api/v1/auth/mock-login',
      payload: { userId: USERS.fleetA },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe('forbidden');
    await a.close();
  });

  it('errors use the envelope and never leak internals', async () => {
    const a = await app();
    const bad = await a.inject({
      method: 'POST',
      url: '/api/v1/auth/mock-login',
      headers: H,
      payload: { userId: 'not-a-uuid' },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('validation_failed');
    const nf = await a.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(nf.statusCode).toBe(404);
    expect(nf.json().error.code).toBe('not_found');
    await a.close();
  });

  it('sets security headers', async () => {
    const a = await app();
    const r = await a.inject({ method: 'GET', url: '/healthz' });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-security-policy']).toBeDefined();
    expect(r.headers['x-powered-by']).toBeUndefined();
    await a.close();
  });

  it('rate-limits mock-login at 10 per minute', async () => {
    const a = await app();
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await login(a, USERS.fleetA)).r.statusCode);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
    await a.close();
  });

  it('/healthz is live and /readyz checks the database', async () => {
    const a = await app();
    expect((await a.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    expect((await a.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(200);
    await a.close();
    const broken = await buildApp({
      config: loadConfig(env() as NodeJS.ProcessEnv),
      fleet: createPostgresMockSource(pool, loadConfig(env() as NodeJS.ProcessEnv)),
      repo: {
        ...createAppStateRepository(pool),
        ping: async () => {
          throw new Error('down');
        },
      },
    });
    const r = await broken.inject({ method: 'GET', url: '/readyz' });
    expect(r.statusCode).toBe(503);
    expect(r.body).not.toContain('down');
    await broken.close();
  });
});

describe('withTenant (D-02)', () => {
  it('concurrent tenants on a shared pool never see each other and leave no setting behind', async () => {
    const small = createPool(db.appUrl, 2);
    const count = (id: string) =>
      withTenant(
        small,
        id,
        async (tx) =>
          (
            await tx.query(
              'SELECT count(*)::int AS n, count(DISTINCT consumer_id)::int AS d FROM packs',
            )
          ).rows[0],
      );
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        count([CONSUMERS.A, CONSUMERS.B, CONSUMERS.C][i % 3] as string),
      ),
    );
    for (const r of results) expect(r).toMatchObject({ n: 40, d: 1 });
    const bare = await small.query('SELECT count(*)::int AS n FROM packs');
    expect(bare.rows[0].n).toBe(0);
    await small.end();
  });

  it('rejects a non-uuid consumer id before touching the database', async () => {
    await expect(withTenant(pool, "x'; DROP TABLE packs; --", async () => 1)).rejects.toThrow();
  });

  it('rolls back writes on error and clears the setting on the same connection', async () => {
    const one = createPool(db.appUrl, 1);
    const before = await withTenant(
      one,
      CONSUMERS.A,
      async (tx) =>
        (
          await tx.query(
            "SELECT count(*)::int AS n FROM audit_events WHERE action = 'rollback-probe'",
          )
        ).rows[0]?.n,
    );
    await expect(
      withTenant(one, CONSUMERS.A, async (tx) => {
        await tx.query(
          "INSERT INTO audit_events (consumer_id, action, object) VALUES ($1, 'rollback-probe', 'x')",
          [CONSUMERS.A],
        );
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const setting = await one.query("SELECT current_setting('app.consumer_id', true) AS v");
    expect([null, '']).toContain(setting.rows[0].v);
    const after = await withTenant(
      one,
      CONSUMERS.A,
      async (tx) =>
        (
          await tx.query(
            "SELECT count(*)::int AS n FROM audit_events WHERE action = 'rollback-probe'",
          )
        ).rows[0]?.n,
    );
    expect(after).toBe(before);
    await one.end();
  });
});

describe('token edge cases', () => {
  const key = (k = 's'.repeat(48)) => new TextEncoder().encode(k);
  const cookieFor = (t: string) => ({ cookie: `ql_session=${t}` });
  const get = async (headers: Record<string, string>) => {
    const a = await app();
    const r = await a.inject({ method: 'GET', url: '/api/v1/me', headers });
    await a.close();
    return r;
  };

  it('rejects: no exp, wrong issuer, wrong role claim, unknown user, non-uuid sub, HS512', async () => {
    const { SignJWT } = await import('jose');
    const mk = (opts: {
      sub?: string;
      iss?: string;
      role?: string;
      exp?: boolean;
      alg?: string;
    }) => {
      const j = new SignJWT({ cid: CONSUMERS.A, role: opts.role ?? 'technician' })
        .setProtectedHeader({ alg: opts.alg ?? 'HS256' })
        .setSubject(opts.sub ?? USERS.techA)
        .setIssuer(opts.iss ?? 'ql')
        .setIssuedAt();
      if (opts.exp !== false) j.setExpirationTime('1h');
      return j.sign(key());
    };
    const cases = {
      noExp: await mk({ exp: false }),
      wrongIssuer: await mk({ iss: 'someone-else' }),
      roleDisagrees: await mk({ role: 'fleet_manager' }),
      unknownUser: await mk({ sub: '99999999-9999-4999-8999-999999999999' }),
      nonUuidSub: await mk({ sub: "1'; DROP TABLE users;--" }),
      hs512: await mk({ alg: 'HS512' }),
    };
    for (const [name, token] of Object.entries(cases)) {
      const r = await get(cookieFor(token));
      expect(r.statusCode, name).toBe(401);
    }
  });
});

describe('platform audit', () => {
  it('a platform_admin login writes a consumer-less audit event that tenants cannot see', async () => {
    const a = await app();
    await login(a, USERS.platform);
    // ql_owner is bound by RLS too and cannot read consumer-less rows; the superuser can.
    const owner = createPool(db.superUrl, 1);
    const r = await owner.query(
      "SELECT count(*)::int AS n FROM audit_events WHERE consumer_id IS NULL AND action = 'login' AND user_id = $1",
      [USERS.platform],
    );
    expect(r.rows[0].n).toBeGreaterThanOrEqual(1);
    await owner.end();
    const seen = await withTenant(
      pool,
      CONSUMERS.A,
      async (tx) =>
        (
          await tx.query('SELECT count(*)::int AS n FROM audit_events WHERE user_id = $1', [
            USERS.platform,
          ])
        ).rows[0]?.n,
    );
    expect(seen).toBe(0);
    await a.close();
  });

  it('audit_platform_event refuses to run inside a tenant context', async () => {
    await expect(
      withTenant(pool, CONSUMERS.A, (tx) =>
        tx.query('SELECT audit_platform_event($1, $2, $3)', [USERS.platform, 'x', 'y']),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('error mapping', () => {
  it('a server-side DTO validation failure is a 500 without details, not a 400', async () => {
    const a = await app();
    a.get('/boom', async () => {
      const { MeSchema } = await import('@ql/contracts');
      return MeSchema.parse({ secret_internal_field: 'x' });
    });
    const r = await a.inject({ method: 'GET', url: '/boom' });
    expect(r.statusCode).toBe(500);
    expect(r.json()).toEqual({ error: { code: 'internal', message: 'Something went wrong' } });
    await a.close();
  });

  it('keeps the original status for an oversized body and /healthz is not rate limited', async () => {
    const a = await app();
    const big = await a.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { ...H, 'content-type': 'application/json' },
      payload: JSON.stringify({ x: 'y'.repeat(200 * 1024) }),
    });
    expect(big.statusCode).toBe(413);
    for (let i = 0; i < 320; i++)
      expect((await a.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    await a.close();
  });
});
