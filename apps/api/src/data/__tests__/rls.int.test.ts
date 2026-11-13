import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CONSUMERS,
  newPool,
  startTestDb,
  TENANT_TABLES,
  withTenantRaw,
  type TestDb,
} from '../testing/db.ts';

// D-02, D-03, D-12, D-13: database-level tenant isolation, tested as the real app role.
let db: TestDb;
let app: pg.Pool;
let owner: pg.Pool;

beforeAll(async () => {
  db = await startTestDb();
  app = newPool(db.appUrl, 1); // one connection: proves leaks across pooled reuse
  owner = newPool(db.ownerUrl, 1);
});
afterAll(async () => {
  await app?.end();
  await owner?.end();
  await db?.stop();
});

const count = async (c: pg.Pool | pg.PoolClient, t: string) =>
  Number((await c.query(`SELECT count(*) AS n FROM ${t}`)).rows[0].n);

describe('roles (D-02)', () => {
  it('ql_app is NOSUPERUSER NOBYPASSRLS and owns nothing', async () => {
    const r = await app.query(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'ql_app'",
    );
    expect(r.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    const owned = await owner.query(
      "SELECT count(*) AS n FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner WHERE r.rolname = 'ql_app'",
    );
    expect(Number(owned.rows[0].n)).toBe(0);
  });

  it('every tenant table has RLS enabled and forced', async () => {
    const r = await owner.query(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = ANY($1)`,
      [TENANT_TABLES],
    );
    expect(r.rows).toHaveLength(TENANT_TABLES.length);
    for (const row of r.rows) {
      expect(row, row.relname).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
    }
  });
});

describe('row visibility (D-12)', () => {
  it.each(TENANT_TABLES)('%s returns 0 rows with no tenant set', async (t) => {
    expect(await count(app, t)).toBe(0);
  });

  it.each(TENANT_TABLES)(
    '%s is empty for a malformed or empty setting, never an error leak',
    async (t) => {
      const c = await app.connect();
      try {
        await c.query('BEGIN');
        await c.query("SELECT set_config('app.consumer_id', '', true)");
        expect(await count(c, t)).toBe(0);
        await c.query('ROLLBACK');
      } finally {
        c.release();
      }
    },
  );

  it('with A set, only A rows come back from every tenant table', async () => {
    await withTenantRaw(app, CONSUMERS.A, async (c) => {
      for (const t of TENANT_TABLES) {
        const own = t === 'consumers' ? 'id' : 'consumer_id';
        const total = await count(c, t);
        const mine = Number(
          (await c.query(`SELECT count(*) AS n FROM ${t} WHERE ${own} = $1`, [CONSUMERS.A])).rows[0]
            .n,
        );
        expect(total, t).toBeGreaterThan(0);
        expect(mine, t).toBe(total);
      }
    });
  });

  it('the tenant setting does not survive the transaction on a pooled connection', async () => {
    await withTenantRaw(app, CONSUMERS.A, async (c) => {
      expect(await count(c, 'packs')).toBeGreaterThan(0);
    });
    // Same single pooled connection is reused here.
    const s = await app.query("SELECT current_setting('app.consumer_id', true) AS v");
    expect(s.rows[0].v === null || s.rows[0].v === '').toBe(true);
    expect(await count(app, 'packs')).toBe(0);
  });

  it('a consumer cannot write a row for another consumer', async () => {
    await expect(
      withTenantRaw(app, CONSUMERS.A, (c) =>
        c.query(`INSERT INTO audit_events (consumer_id, action, object) VALUES ($1, 'x', 'y')`, [
          CONSUMERS.B,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('malformed tenant setting', () => {
  it('a non-uuid setting errors (22P02) and returns no rows', async () => {
    const c = await app.connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.consumer_id', 'not-a-uuid', true)");
      await expect(c.query('SELECT * FROM packs')).rejects.toMatchObject({ code: '22P02' });
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });
});

describe('tenant columns must agree (D-03)', () => {
  it('rejects a health row whose consumer does not match its pack', async () => {
    const packOfB = (
      await withTenantRaw(app, CONSUMERS.B, (c) => c.query('SELECT id FROM packs LIMIT 1'))
    ).rows[0].id as string;
    await expect(
      withTenantRaw(owner, CONSUMERS.A, (c) =>
        c.query(
          `INSERT INTO pack_health (pack_id, consumer_id, recorded_at, soh_pct, rul_months_low, rul_months_high, model_version)
           VALUES ($1, $2, now(), 90, 10, 14, 'test')`,
          [packOfB, CONSUMERS.A],
        ),
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('rejects an alert whose consumer does not match its pack', async () => {
    const packOfB = (
      await withTenantRaw(app, CONSUMERS.B, (c) => c.query('SELECT id FROM packs LIMIT 1'))
    ).rows[0].id as string;
    await expect(
      withTenantRaw(app, CONSUMERS.A, (c) =>
        c.query(
          `INSERT INTO alerts (consumer_id, pack_id, severity, title, description, recommended_action, model_version)
           VALUES ($1, $2, 'low', 't', 'd', 'a', 'test')`,
          [CONSUMERS.A, packOfB],
        ),
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('rejects a notification channel whose user belongs to another consumer', async () => {
    const userOfB = (
      await withTenantRaw(app, CONSUMERS.B, (c) => c.query('SELECT id FROM users LIMIT 1'))
    ).rows[0].id as string;
    await expect(
      withTenantRaw(app, CONSUMERS.A, (c) =>
        c.query(
          `INSERT INTO notification_channels (user_id, consumer_id, type, target) VALUES ($1, $2, 'sms', '+919800000000')`,
          [userOfB, CONSUMERS.A],
        ),
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
});

describe('privileged paths (D-04) and audit log (D-13)', () => {
  it('auth_find_user works with no tenant set and returns only four columns', async () => {
    const ids = (
      await withTenantRaw(app, CONSUMERS.A, (c) => c.query('SELECT id FROM users LIMIT 1'))
    ).rows;
    const r = await app.query('SELECT * FROM auth_find_user($1)', [ids[0].id]);
    expect(r.rows).toHaveLength(1);
    expect(Object.keys(r.rows[0]).sort()).toEqual(['consumer_id', 'id', 'name', 'role']);
  });

  it('auth_find_user finds the platform_admin, who has no consumer', async () => {
    const r = await app.query(
      "SELECT * FROM auth_find_user('d0000000-0000-4000-8000-000000000001')",
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ role: 'platform_admin', consumer_id: null });
  });

  it('auth_find_user returns nothing for an unknown id', async () => {
    const r = await app.query(
      "SELECT * FROM auth_find_user('99999999-9999-4999-8999-999999999999')",
    );
    expect(r.rowCount).toBe(0);
  });

  it('list_consumer_ids returns all three consumers with no tenant set', async () => {
    const r = await app.query('SELECT * FROM list_consumer_ids()');
    expect(r.rows.map((x) => Object.values(x)[0]).sort()).toEqual(
      [CONSUMERS.A, CONSUMERS.B, CONSUMERS.C].sort(),
    );
  });

  it('list_consumer_ids exposes exactly one column', async () => {
    const r = await app.query('SELECT * FROM list_consumer_ids()');
    expect(r.fields).toHaveLength(1);
  });

  it('ql_app cannot UPDATE or DELETE audit events, even for its own consumer', async () => {
    await expect(
      withTenantRaw(app, CONSUMERS.A, (c) => c.query("UPDATE audit_events SET action = 'x'")),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      withTenantRaw(app, CONSUMERS.A, (c) => c.query('DELETE FROM audit_events')),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('ql_app cannot alter the role policy history', async () => {
    await expect(app.query("UPDATE role_policies SET policy = '{}'")).rejects.toMatchObject({
      code: '42501',
    });
    await expect(app.query('DELETE FROM role_policies')).rejects.toMatchObject({ code: '42501' });
  });
});

describe('seed coverage', () => {
  it('3 consumers, about 40 packs each, 180 days of history, every severity and status, every role', async () => {
    for (const id of Object.values(CONSUMERS)) {
      await withTenantRaw(app, id, async (c) => {
        expect(await count(c, 'packs')).toBe(40);
        const span = await c.query(
          'SELECT extract(day FROM max(recorded_at) - min(recorded_at)) AS d FROM pack_health',
        );
        expect(Number(span.rows[0].d)).toBeGreaterThanOrEqual(177);
        const combos = await c.query('SELECT DISTINCT severity, status FROM alerts');
        expect(combos.rowCount).toBe(9);
        const roles = await c.query('SELECT DISTINCT role FROM users ORDER BY role');
        expect(roles.rows.map((r) => r.role)).toEqual([
          'consumer_admin',
          'fleet_manager',
          'technician',
        ]);
      });
    }
    const mf = await app.query("SELECT count(*) AS n FROM manufacturers WHERE name = '82 Volts'");
    expect(Number(mf.rows[0].n)).toBe(1);
  });

  it('seeds the canary names for consumers B and C (D-12)', async () => {
    const b = await withTenantRaw(app, CONSUMERS.B, (c) => c.query('SELECT name FROM consumers'));
    const cc = await withTenantRaw(app, CONSUMERS.C, (c) => c.query('SELECT name FROM consumers'));
    expect(b.rows[0].name).toContain('CANARY-CONSUMER-B');
    expect(cc.rows[0].name).toContain('CANARY-CONSUMER-C');
  });

  it('the seed policy matches config/permissions.json and starts at version 1', async () => {
    const r = await app.query('SELECT version, policy FROM role_policies ORDER BY version');
    expect(r.rows[0].version).toBe(1);
    expect(r.rows[0].policy.roles.platform_admin).toEqual(['permissions.manage']);
  });
});

describe('more D-03 mismatches', () => {
  const firstId = async (c: string, table: string) =>
    (await withTenantRaw(app, c, (x) => x.query(`SELECT id FROM ${table} LIMIT 1`))).rows[0]
      .id as string;

  it("notification_jobs rejects another consumer's alert", async () => {
    const alertB = await firstId(CONSUMERS.B, 'alerts');
    const userA = await firstId(CONSUMERS.A, 'users');
    await expect(
      withTenantRaw(app, CONSUMERS.A, (c) =>
        c.query(
          `INSERT INTO notification_jobs (consumer_id, alert_id, user_id, channel, target) VALUES ($1,$2,$3,'sms','+919800000001')`,
          [CONSUMERS.A, alertB, userA],
        ),
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it("notification_log rejects another consumer's alert", async () => {
    const alertB = await firstId(CONSUMERS.B, 'alerts');
    await expect(
      withTenantRaw(app, CONSUMERS.A, (c) =>
        c.query(
          `INSERT INTO notification_log (consumer_id, alert_id, kind, channel, status) VALUES ($1,$2,'alert','email','sent')`,
          [CONSUMERS.A, alertB],
        ),
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it("an alert cannot be acknowledged by another consumer's user", async () => {
    const userB = await firstId(CONSUMERS.B, 'users');
    await expect(
      withTenantRaw(app, CONSUMERS.A, (c) =>
        c.query(
          `UPDATE alerts SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = now() WHERE status = 'open'`,
          [userB],
        ),
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it("an audit event cannot name another consumer's user", async () => {
    const userB = await firstId(CONSUMERS.B, 'users');
    await expect(
      withTenantRaw(app, CONSUMERS.A, (c) =>
        c.query(
          `INSERT INTO audit_events (consumer_id, user_id, action, object) VALUES ($1,$2,'x','y')`,
          [CONSUMERS.A, userB],
        ),
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
});

describe('platform-level writes (D-01, D-13)', () => {
  const PA = 'd0000000-0000-4000-8000-000000000001';

  it('ql_app cannot insert a consumer-less audit event directly', async () => {
    await expect(
      app.query(`INSERT INTO audit_events (consumer_id, action, object) VALUES (NULL, 'x', 'y')`),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('ql_app cannot insert a role policy directly', async () => {
    await expect(
      app.query(`INSERT INTO role_policies (version, policy) VALUES (99, '{}')`),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('platform functions refuse to run inside a tenant context', async () => {
    await expect(
      withTenantRaw(app, CONSUMERS.A, (c) =>
        c.query('SELECT audit_platform_event($1, $2, $3)', [PA, 'x', 'y']),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      withTenantRaw(app, CONSUMERS.A, (c) => c.query(`SELECT role_policy_publish('{}', $1)`, [PA])),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('platform functions refuse a non-platform_admin actor', async () => {
    const userA = (
      await withTenantRaw(app, CONSUMERS.A, (c) => c.query('SELECT id FROM users LIMIT 1'))
    ).rows[0].id;
    await expect(
      app.query('SELECT audit_platform_event($1, $2, $3)', [userA, 'x', 'y']),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(app.query(`SELECT role_policy_publish('{}', $1)`, [userA])).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('a platform_admin can publish a policy version and write an audit event, which tenants cannot see', async () => {
    const v = await app.query(`SELECT role_policy_publish('{"version":2}', $1) AS v`, [PA]);
    expect(v.rows[0].v).toBe(2);
    await app.query('SELECT audit_platform_event($1, $2, $3)', [
      PA,
      'policy.update',
      'role_policy:2',
    ]);
    const seen = await withTenantRaw(app, CONSUMERS.A, (c) =>
      c.query("SELECT 1 FROM audit_events WHERE action = 'policy.update'"),
    );
    expect(seen.rowCount).toBe(0);
    const history = await app.query('SELECT version FROM role_policies ORDER BY version');
    expect(history.rows.map((r) => r.version)).toEqual([1, 2]);
  });
});

describe('grants and structure', () => {
  it('ql_app has no INSERT on packs, users, pack_health or consumers, and no TRUNCATE anywhere', async () => {
    for (const t of ['packs', 'users', 'pack_health', 'consumers']) {
      await expect(
        withTenantRaw(app, CONSUMERS.A, (c) => c.query(`DELETE FROM ${t}`)),
      ).rejects.toMatchObject({ code: '42501' });
    }
    await expect(app.query('TRUNCATE alerts')).rejects.toMatchObject({ code: '42501' });
  });

  it('ql_app can only update the acknowledgement columns of alerts', async () => {
    await expect(
      withTenantRaw(app, CONSUMERS.A, (c) => c.query("UPDATE alerts SET severity = 'low'")),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('ql_app owns no relation, function, type or schema and belongs to no role', async () => {
    const q = `SELECT
      (SELECT count(*) FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner WHERE r.rolname = 'ql_app') +
      (SELECT count(*) FROM pg_type t JOIN pg_roles r ON r.oid = t.typowner WHERE r.rolname = 'ql_app') +
      (SELECT count(*) FROM pg_namespace n JOIN pg_roles r ON r.oid = n.nspowner WHERE r.rolname = 'ql_app') +
      (SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname = 'ql_app') AS n`;
    expect(Number((await owner.query(q)).rows[0].n)).toBe(0);
  });

  it('every public table with a consumer_id column has forced RLS and a policy', async () => {
    const r = await owner.query(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
              (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'pgmigrations'
         AND (c.relname = 'role_policies' OR EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'consumer_id' AND NOT a.attisdropped)
              OR c.relname = 'consumers')`,
    );
    expect(r.rows.length).toBeGreaterThanOrEqual(10);
    for (const row of r.rows) {
      expect(row, row.relname).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
      expect(Number(row.policies), row.relname).toBeGreaterThan(0);
    }
  });

  it('the only policies that apply to ql_app or PUBLIC on tenant tables use ql_visible', async () => {
    const r = await owner.query(
      `SELECT tablename, policyname, qual FROM pg_policies
       WHERE schemaname = 'public' AND roles && ARRAY['ql_app', 'public']::name[]
         AND tablename <> 'role_policies'`,
    );
    expect(r.rows.length).toBeGreaterThan(0);
    for (const row of r.rows)
      expect(row.qual, `${row.tablename}.${row.policyname}`).toContain('ql_visible');
  });
});

describe('seed policy', () => {
  it('version 1 equals config/permissions.json', async () => {
    const file = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../../../../config/permissions.json'), 'utf8'),
    );
    const r = await owner.query('SELECT policy FROM role_policies WHERE version = 1');
    expect(r.rows[0].policy).toEqual(file);
  });
});
