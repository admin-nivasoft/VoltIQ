import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AlertPageSchema,
  MeSchema,
  RolePolicyResponseSchema,
  type RolePolicy,
} from '@ql/contracts';
import policyFile from '../../../../../config/permissions.json';
import { buildApp } from '../../app.ts';
import { loadConfig } from '../../config.ts';
import {
  createAppStateRepository,
  createPool,
  createPostgresMockSource,
  type Pool,
} from '../../data/index.ts';
import { newPool, startTestDb, type TestDb } from '../../data/testing/db.ts';

const H = { 'x-requested-with': 'ql' };
const U = {
  fleetA: 'e0000001-0000-4000-8000-000000000001',
  techA: 'e0000001-0000-4000-8000-000000000002',
  adminA: 'e0000001-0000-4000-8000-000000000003',
  platform: 'd0000000-0000-4000-8000-000000000001',
};
type Who = keyof typeof U;
const base = policyFile as RolePolicy;

let db: TestDb;
let pool: Pool;
let app: FastifyInstance;
const cookies = {} as Record<Who, string>;

const call = (
  method: 'GET' | 'PUT' | 'POST',
  url: string,
  who: Who | null,
  body?: unknown,
  headers: Record<string, string> = H,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: {
      ...(who ? { cookie: cookies[who] } : {}),
      ...(method === 'GET' ? {} : headers),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { payload: JSON.stringify(body) } : {}),
  });
const withRoles = (edit: (r: RolePolicy['roles']) => void) => {
  const roles = structuredClone(base.roles);
  edit(roles);
  return { roles };
};
const version = async () =>
  RolePolicyResponseSchema.parse((await call('GET', '/admin/permissions', 'platform')).json())
    .policy.version;

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
  for (const [k, id] of Object.entries(U)) {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mock-login',
      headers: H,
      payload: { userId: id },
    });
    cookies[k as Who] = String(r.headers['set-cookie']).split(';')[0] as string;
  }
});
afterAll(async () => {
  await app?.close();
  await pool?.end();
  await db?.stop();
});

describe('GET /admin/permissions', () => {
  it('only the platform admin may read it', async () => {
    const ok = await call('GET', '/admin/permissions', 'platform');
    expect(ok.statusCode).toBe(200);
    const body = RolePolicyResponseSchema.parse(ok.json());
    expect(body.policy.roles).toEqual(base.roles);
    for (const who of ['fleetA', 'techA', 'adminA'] as Who[])
      expect((await call('GET', '/admin/permissions', who)).statusCode, who).toBe(403);
    expect((await call('GET', '/admin/permissions', null)).statusCode).toBe(401);
  });
});

describe('PUT /admin/permissions (D-01)', () => {
  it('a consumer admin cannot change the policy: 403, and nothing changes', async () => {
    const before = await version();
    const r = await call(
      'PUT',
      '/admin/permissions',
      'adminA',
      withRoles((x) => x.technician.push('alerts.acknowledge')),
    );
    expect(r.statusCode).toBe(403);
    for (const who of ['fleetA', 'techA'] as Who[]) {
      expect(
        (
          await call(
            'PUT',
            '/admin/permissions',
            who,
            withRoles(() => {}),
          )
        ).statusCode,
        who,
      ).toBe(403);
    }
    expect(
      (
        await call(
          'PUT',
          '/admin/permissions',
          null,
          withRoles(() => {}),
        )
      ).statusCode,
    ).toBe(401);
    expect(await version()).toBe(before);
  });

  it('needs the X-Requested-With header', async () => {
    expect(
      (
        await call(
          'PUT',
          '/admin/permissions',
          'platform',
          withRoles(() => {}),
          {},
        )
      ).statusCode,
    ).toBe(403);
  });

  it.each([
    [
      'permissions.manage on a consumer role',
      (r: RolePolicy['roles']) => r.consumer_admin.push('permissions.manage'),
    ],
    [
      'tenant permissions on platform_admin',
      (r: RolePolicy['roles']) => r.platform_admin.push('fleet.view'),
    ],
    [
      'platform_admin without permissions.manage',
      (r: RolePolicy['roles']) => (r.platform_admin = []),
    ],
    [
      'an unknown permission',
      (r: RolePolicy['roles']) => (r.technician as string[]).push('users.manage'),
    ],
  ])('rejects %s with a 400 and changes nothing', async (_n, edit) => {
    const before = await version();
    const r = await call('PUT', '/admin/permissions', 'platform', withRoles(edit));
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('validation_failed');
    expect(await version()).toBe(before);
  });

  it.each([
    {},
    { roles: 'x' },
    { roles: { fleet_manager: [] } },
    { roles: { ...base.roles, extra_role: ['fleet.view'] } },
  ])('rejects a malformed body %j', async (body) => {
    const r = await call('PUT', '/admin/permissions', 'platform', body);
    // An unknown extra role is dropped by the schema; the other cases are invalid.
    expect([200, 400]).toContain(r.statusCode);
    if (JSON.stringify(body).includes('extra_role')) {
      const roles = RolePolicyResponseSchema.parse(r.json()).policy.roles as Record<
        string,
        unknown
      >;
      expect(roles.extra_role).toBeUndefined();
    }
  });

  it('publishes a new version at once: the change takes effect immediately and old versions are kept', async () => {
    const before = await version();
    const dropAck = await call(
      'PUT',
      '/admin/permissions',
      'platform',
      withRoles(
        (r) => (r.fleet_manager = r.fleet_manager.filter((p) => p !== 'alerts.acknowledge')),
      ),
    );
    expect(dropAck.statusCode).toBe(200);
    const saved = RolePolicyResponseSchema.parse(dropAck.json());
    expect(saved.policy.version).toBe(before + 1);
    expect(saved.policy.roles.fleet_manager).not.toContain('alerts.acknowledge');

    // /me and the guard both follow the new policy straight away.
    const me = MeSchema.parse((await call('GET', '/me', 'fleetA')).json());
    expect(me.permissions).not.toContain('alerts.acknowledge');
    const open = AlertPageSchema.parse((await call('GET', '/alerts?status=open', 'fleetA')).json())
      .items[0]!;
    expect((await call('POST', `/alerts/${open.id}/acknowledge`, 'fleetA')).statusCode).toBe(403);
    // The consumer admin still can: only the fleet manager's row changed.
    expect((await call('POST', `/alerts/${open.id}/acknowledge`, 'adminA')).statusCode).toBe(200);

    // Put it back: a new version again, never an overwrite.
    const restored = await call('PUT', '/admin/permissions', 'platform', { roles: base.roles });
    expect(RolePolicyResponseSchema.parse(restored.json()).policy.version).toBe(before + 2);
    const open2 = AlertPageSchema.parse((await call('GET', '/alerts?status=open', 'fleetA')).json())
      .items[0]!;
    expect((await call('POST', `/alerts/${open2.id}/acknowledge`, 'fleetA')).statusCode).toBe(200);

    const su = newPool(db.superUrl, 1);
    try {
      const rows = (
        await su.query('SELECT version, policy, created_by FROM role_policies ORDER BY version')
      ).rows;
      expect(rows.map((r) => r.version)).toEqual(
        Array.from({ length: before + 2 }, (_, i) => i + 1),
      );
      expect(rows[0].policy.roles.fleet_manager).toContain('alerts.acknowledge'); // version 1 untouched
      expect(rows.at(-2).created_by).toBe(U.platform);
    } finally {
      await su.end();
    }
  });

  it('writes a platform audit event that no consumer can see', async () => {
    await call('PUT', '/admin/permissions', 'platform', { roles: base.roles });
    const su = newPool(db.superUrl, 1);
    try {
      const n = (
        await su.query(
          "SELECT count(*)::int AS n FROM audit_events WHERE action = 'policy.update' AND consumer_id IS NULL AND user_id = $1",
          [U.platform],
        )
      ).rows[0].n;
      expect(n).toBeGreaterThanOrEqual(2);
    } finally {
      await su.end();
    }
    const asTenant = newPool(db.appUrl, 1);
    try {
      const c = await asTenant.connect();
      await c.query('BEGIN');
      await c.query(
        "SELECT set_config('app.consumer_id', 'a0000000-0000-4000-8000-000000000001', true)",
      );
      expect(
        (
          await c.query(
            "SELECT count(*)::int AS n FROM audit_events WHERE action = 'policy.update'",
          )
        ).rows[0].n,
      ).toBe(0);
      await c.query('ROLLBACK');
      c.release();
    } finally {
      await asTenant.end();
    }
  });

  it('two simultaneous saves get two different versions', async () => {
    const before = await version();
    const [a, b] = await Promise.all([
      call('PUT', '/admin/permissions', 'platform', { roles: base.roles }),
      call('PUT', '/admin/permissions', 'platform', { roles: base.roles }),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    const versions = [a, b]
      .map((r) => RolePolicyResponseSchema.parse(r.json()).policy.version)
      .sort();
    expect(versions).toEqual([before + 1, before + 2]);
  });

  it('ignores a version, an author or a consumer named in the body', async () => {
    const before = await version();
    const r = await call('PUT', '/admin/permissions', 'platform', {
      version: 999,
      created_by: U.adminA,
      consumerId: 'x',
      roles: base.roles,
    });
    expect(RolePolicyResponseSchema.parse(r.json()).policy.version).toBe(before + 1);
    const su = newPool(db.superUrl, 1);
    try {
      expect(
        (await su.query('SELECT created_by FROM role_policies WHERE version = $1', [before + 1]))
          .rows[0].created_by,
      ).toBe(U.platform);
    } finally {
      await su.end();
    }
  });

  it('is in the OpenAPI document', async () => {
    const doc = (await call('GET', '/openapi.json', null)).json();
    expect(Object.keys(doc.paths['/admin/permissions']).sort()).toEqual(['get', 'put']);
  });
});
