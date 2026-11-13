import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPostgresMockSource } from '../adapters/postgres-mock.ts';
import { createAppStateRepository } from '../app-state.ts';
import type { Thresholds } from '../calculations.ts';
import { QueryError } from '../query.ts';
import { withTenant } from '../tenant.ts';
import { CONSUMERS, newPool, startTestDb, type TestDb } from '../testing/db.ts';
import { fleetDataSourceContract } from '../testing/fleet-contract.ts';

const thresholds: Thresholds = {
  nearEolMonths: 6,
  trendDeclining: -0.5,
  trendImproving: 0.5,
  trendWindowDays: 90,
  warrantyExpiringDays: 90,
};
const USERS = {
  fleetA: 'e0000001-0000-4000-8000-000000000001',
  techA: 'e0000001-0000-4000-8000-000000000002',
  adminA: 'e0000001-0000-4000-8000-000000000003',
  fleetB: 'e0000002-0000-4000-8000-000000000001',
};

let db: TestDb;
let pool: pg.Pool;
let bypass: pg.Pool;

beforeAll(async () => {
  db = await startTestDb();
  pool = newPool(db.appUrl, 4);
  bypass = newPool(db.superUrl, 4);
});
afterAll(async () => {
  await pool?.end();
  await bypass?.end();
  await db?.stop();
});

// The shared suite, run against the postgres-mock adapter.
const expectedSummary = {
  A: { packsInService: 37, averageSohPct: 91.8, activeAlerts: 6, packsNearingEol: 7 },
  B: { packsInService: 37, averageSohPct: 91.2, activeAlerts: 6, packsNearingEol: 7 },
  C: { packsInService: 37, averageSohPct: 92.0, activeAlerts: 6, packsNearingEol: 7 },
};
const contractContext = (p: () => pg.Pool) => () => ({
  source: createPostgresMockSource(p(), thresholds),
  consumers: CONSUMERS,
  thresholds,
  emptyConsumer: 'f1111111-1111-4111-8111-111111111111',
  expectedSummary,
});
fleetDataSourceContract(
  'postgres-mock',
  contractContext(() => pool),
);
// Defence in depth: the same suite on a superuser connection, where RLS filters nothing. Only the
// adapter's own consumer predicates stand between the tenants. A future vendor adapter has no RLS
// behind it at all, so it must pass this way too.
fleetDataSourceContract(
  'postgres-mock, RLS bypassed',
  contractContext(() => bypass),
);

describe('postgres-mock specifics', () => {
  it('computes trends from seeded history: declining, improving and stable packs all exist', async () => {
    const src = createPostgresMockSource(pool, thresholds);
    const { items } = await src.listPacks(CONSUMERS.A, { page: 1, pageSize: 100 });
    const dirs = new Set(items.map((p) => p.trend.direction));
    expect(dirs).toEqual(new Set(['declining', 'improving', 'stable']));
    const s = await src.getFleetSummary(CONSUMERS.A);
    expect(s.packsNearingEol).toBeGreaterThan(0);
    expect(s.packsInService).toBe(37);
  });

  it('thresholds are configuration: raising the near-EOL months raises the count', async () => {
    const base = await createPostgresMockSource(pool, thresholds).getFleetSummary(CONSUMERS.A);
    const wide = await createPostgresMockSource(pool, {
      ...thresholds,
      nearEolMonths: 24,
    }).getFleetSummary(CONSUMERS.A);
    expect(wide.packsNearingEol).toBeGreaterThan(base.packsNearingEol);
  });

  it('a clock a year ahead leaves no readings in the window: insufficient data', async () => {
    const future = createPostgresMockSource(
      pool,
      thresholds,
      () => new Date(Date.now() + 365 * 86_400_000),
    );
    const { items } = await future.listPacks(CONSUMERS.A, { page: 1, pageSize: 100 });
    expect(items.every((p) => p.trend.direction === 'insufficient_data')).toBe(true);
  });

  it('with a pool as another consumer, the explicit WHERE still returns nothing for A (second layer)', async () => {
    // A tenant context for B cannot be tricked into A's rows by passing A as the parameter.
    const rows = await withTenant(
      pool,
      CONSUMERS.B,
      async (tx) =>
        (await tx.query('SELECT id FROM packs WHERE consumer_id = $1', [CONSUMERS.A])).rows,
    );
    expect(rows).toHaveLength(0);
  });
});

const P = {
  fleetA: { consumerId: CONSUMERS.A, userId: USERS.fleetA },
  techA: { consumerId: CONSUMERS.A, userId: USERS.techA },
  adminA: { consumerId: CONSUMERS.A, userId: USERS.adminA },
};

describe('AppStateRepository', () => {
  const repo = () => createAppStateRepository(pool);
  const openAlertIds = async (consumerId: string) =>
    (
      await createPostgresMockSource(pool, thresholds).listAlerts(consumerId, {
        page: 1,
        pageSize: 100,
        status: 'open',
      })
    ).items.map((a) => a.id);

  it('acknowledges an open alert: records who and when, lowers the open count, writes an audit event', async () => {
    const src = createPostgresMockSource(pool, thresholds);
    const before = (await src.getFleetSummary(CONSUMERS.A)).activeAlerts;
    const [id] = await openAlertIds(CONSUMERS.A);
    const r = await repo().acknowledgeAlert(P.techA, id!);
    expect(r.kind).toBe('acknowledged');
    if (r.kind !== 'acknowledged') return;
    expect(r.alert.status).toBe('acknowledged');
    expect(r.alert.acknowledgedBy).toBe('Technician A');
    expect(r.alert.acknowledgedAt).toEqual(expect.any(String));
    expect((await src.getFleetSummary(CONSUMERS.A)).activeAlerts).toBe(before - 1);
    const audit = await withTenant(
      pool,
      CONSUMERS.A,
      async (tx) =>
        (
          await tx.query(
            "SELECT count(*)::int AS n FROM audit_events WHERE action = 'alert.acknowledge' AND object = $1",
            [`alert:${id}`],
          )
        ).rows[0],
    );
    expect(audit?.n).toBe(1);
  });

  it('a second acknowledgement is idempotent and keeps the original acknowledgement', async () => {
    const [id] = await openAlertIds(CONSUMERS.A);
    const first = await repo().acknowledgeAlert(P.fleetA, id!);
    const second = await repo().acknowledgeAlert(P.adminA, id!);
    expect(first.kind).toBe('acknowledged');
    expect(second.kind).toBe('already_acknowledged');
    if (first.kind === 'acknowledged' && second.kind === 'already_acknowledged') {
      expect(second.alert.acknowledgedBy).toBe(first.alert.acknowledgedBy);
      expect(second.alert.acknowledgedAt).toBe(first.alert.acknowledgedAt);
    }
    const audit = await withTenant(
      pool,
      CONSUMERS.A,
      async (tx) =>
        (
          await tx.query(
            "SELECT count(*)::int AS n FROM audit_events WHERE action = 'alert.acknowledge' AND object = $1",
            [`alert:${id}`],
          )
        ).rows[0],
    );
    expect(audit?.n).toBe(1);
  });

  it('two simultaneous acknowledgements produce one winner', async () => {
    const [id] = await openAlertIds(CONSUMERS.A);
    const results = await Promise.all([
      repo().acknowledgeAlert(P.fleetA, id!),
      repo().acknowledgeAlert(P.techA, id!),
    ]);
    expect(results.map((r) => r.kind).sort()).toEqual(['acknowledged', 'already_acknowledged']);
  });

  it('a resolved alert cannot be acknowledged', async () => {
    const resolved = await createPostgresMockSource(pool, thresholds).listAlerts(CONSUMERS.A, {
      page: 1,
      pageSize: 1,
      status: 'resolved',
    });
    expect((await repo().acknowledgeAlert(P.fleetA, resolved.items[0]!.id)).kind).toBe('resolved');
  });

  it("another consumer's alert, an unknown id and a malformed id are all not_found", async () => {
    const [bId] = await openAlertIds(CONSUMERS.B);
    expect((await repo().acknowledgeAlert(P.fleetA, bId!)).kind).toBe('not_found');
    expect(
      (await repo().acknowledgeAlert(P.fleetA, '99999999-9999-4999-8999-999999999999')).kind,
    ).toBe('not_found');
    expect((await repo().acknowledgeAlert(P.fleetA, "1' OR 1=1")).kind).toBe('not_found');
    // B's alert is untouched.
    expect(await openAlertIds(CONSUMERS.B)).toContain(bId);
  });

  it('a user from another consumer cannot be recorded as the acknowledger', async () => {
    const ids = await openAlertIds(CONSUMERS.A);
    await expect(
      repo().acknowledgeAlert({ consumerId: CONSUMERS.A, userId: USERS.fleetB }, ids[0]!),
    ).rejects.toMatchObject({ code: '23503' });
    expect(await openAlertIds(CONSUMERS.A)).toContain(ids[0]);
  });

  it("saves, replaces and lists a user's channels, scoped to that user", async () => {
    const r = repo();
    const saved = await r.saveChannels(P.techA, [
      { type: 'email', target: 'tech@example.test', enabled: true },
      { type: 'sms', target: '+919800000002', enabled: false },
    ]);
    expect(saved.map((c) => c.type)).toEqual(['email', 'sms']);
    const replaced = await r.saveChannels(P.techA, [
      { type: 'webhook', target: 'https://hooks.example.test/x', enabled: true },
    ]);
    expect(replaced.map((c) => c.type)).toEqual(['webhook']);
    expect((await r.listChannels(P.techA)).map((c) => c.type)).toEqual(['webhook']);
    // Another user's channels are untouched, and other consumers see nothing of this user's.
    expect((await r.listChannels(P.fleetA)).map((c) => c.type)).toEqual(['email']);
    expect(await r.listChannels({ consumerId: CONSUMERS.B, userId: USERS.techA })).toEqual([]);
  });

  it("cannot save channels for another consumer's user", async () => {
    await expect(
      repo().saveChannels({ consumerId: CONSUMERS.A, userId: USERS.fleetB }, [
        { type: 'sms', target: '+919800000003', enabled: true },
      ]),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('appends to and pages the notification log, scoped to the consumer', async () => {
    const r = repo();
    await r.appendNotificationLog(CONSUMERS.A, {
      alertId: null,
      kind: 'test',
      channel: 'sms',
      status: 'failed',
      attempt: 1,
      error: 'mock failure',
    });
    const a = await r.listNotificationLog(CONSUMERS.A, { page: 1, pageSize: 100 });
    expect(a.items[0]).toMatchObject({
      kind: 'test',
      channel: 'sms',
      status: 'failed',
      error: 'mock failure',
    });
    const b = await r.listNotificationLog(CONSUMERS.B, { page: 1, pageSize: 100 });
    expect(b.items.some((e) => e.error === 'mock failure')).toBe(false);
    await expect(
      r.listNotificationLog(CONSUMERS.A, { page: 1, pageSize: 500 }),
    ).rejects.toBeInstanceOf(QueryError);
  });

  it('an alert id from consumer B cannot be attached to a log entry for A', async () => {
    const [bId] = await openAlertIds(CONSUMERS.B);
    await expect(
      repo().appendNotificationLog(CONSUMERS.A, {
        alertId: bId!,
        kind: 'alert',
        channel: 'email',
        status: 'sent',
        attempt: 1,
        error: null,
      }),
    ).rejects.toMatchObject({ code: '23503' });
  });
});

describe('AppStateRepository with RLS bypassed (explicit predicates)', () => {
  const repo = () => createAppStateRepository(bypass);
  const src = () => createPostgresMockSource(bypass, thresholds);

  it("cannot acknowledge another consumer's alert, and leaves it open", async () => {
    const b = await src().listAlerts(CONSUMERS.B, { page: 1, pageSize: 100, status: 'open' });
    const id = b.items[0]!.id;
    expect((await repo().acknowledgeAlert(P.fleetA, id)).kind).toBe('not_found');
    expect((await src().getAlert(CONSUMERS.B, id))?.status).toBe('open');
  });

  it("another consumer's channels and log are invisible", async () => {
    expect(await repo().listChannels({ consumerId: CONSUMERS.B, userId: USERS.fleetA })).toEqual(
      [],
    );
    const log = await repo().listNotificationLog(CONSUMERS.A, { page: 1, pageSize: 100 });
    const b = await repo().listNotificationLog(CONSUMERS.B, { page: 1, pageSize: 100 });
    const ids = new Set(log.items.map((e) => e.id));
    expect(b.items.some((e) => ids.has(e.id))).toBe(false);
  });

  it('getMe for a user that belongs to another consumer returns nothing', async () => {
    expect(await repo().getMe(CONSUMERS.A, USERS.fleetB)).toBeNull();
  });
});

describe('data details', () => {
  const src = () => createPostgresMockSource(pool, thresholds);
  const ownerPool = () => newPool(db.ownerUrl, 1);

  it('derives warranty status in the adapter: expired, expiring and active', async () => {
    const r = await src().listPacks(CONSUMERS.A, { page: 1, pageSize: 100 });
    const by = (s: string) => r.items.find((p) => p.serial === s)?.warrantyStatus;
    expect(by('QL-A-0001')).toBe('expired');
    expect(by('QL-A-0007')).toBe('expiring');
    expect(by('QL-A-0010')).toBe('active');
  });

  it('searching with a backslash is literal and finds nothing', async () => {
    for (const q of ['QL\\', '\\', 'QL-A-0001\\']) {
      expect((await src().listPacks(CONSUMERS.A, { page: 1, pageSize: 100, q })).total, q).toBe(0);
    }
  });

  it('an alert whose signals hold a non-whitelisted key comes back with that key stripped', async () => {
    const o = ownerPool();
    try {
      await withTenant(o, CONSUMERS.A, async (tx) => {
        await tx.query(
          `UPDATE alerts SET signals = '{"capacity_fade": 1.5, "internal_ref": "X-1"}'::jsonb WHERE id = (SELECT id FROM alerts WHERE consumer_id = $1 ORDER BY id LIMIT 1)`,
          [CONSUMERS.A],
        );
      });
      const all = await src().listAlerts(CONSUMERS.A, { page: 1, pageSize: 100 });
      const withSignal = all.items.filter((a) => a.signals && 'capacity_fade' in a.signals);
      expect(withSignal.length).toBeGreaterThan(0);
      expect(JSON.stringify(all)).not.toContain('internal_ref');
    } finally {
      await o.end();
    }
  });

  it('a pack with low remaining life but no confidence value still counts as near end of life', async () => {
    const o = ownerPool();
    try {
      const before = (await src().getFleetSummary(CONSUMERS.C)).packsNearingEol;
      await withTenant(o, CONSUMERS.C, async (tx) => {
        await tx.query(
          `INSERT INTO pack_health (pack_id, consumer_id, recorded_at, soh_pct, rul_months_low, rul_months_high, model_version, confidence)
           SELECT id, consumer_id, now(), 90, 2, 5, 'test', NULL FROM packs WHERE serial = 'QL-C-0002'`,
        );
      });
      const packs = await src().listPacks(CONSUMERS.C, { page: 1, pageSize: 100, q: 'QL-C-0002' });
      expect(packs.items[0]?.remainingLife).toEqual({
        monthsLow: 2,
        monthsHigh: 5,
        confidence: null,
      });
      expect((await src().getFleetSummary(CONSUMERS.C)).packsNearingEol).toBe(before + 1);
    } finally {
      await o.end();
    }
  });

  it('rejects a huge page number as a bad query, not a database error', async () => {
    await expect(src().listPacks(CONSUMERS.A, { page: 1e20, pageSize: 10 })).rejects.toBeInstanceOf(
      QueryError,
    );
    await expect(
      createAppStateRepository(pool).listNotificationLog(CONSUMERS.A, {
        page: 1,
        pageSize: 10,
        sort: 'error:asc',
      }),
    ).rejects.toBeInstanceOf(QueryError);
  });

  it('the notification log refuses an alert-kind row with no alert and an attempt of 0', async () => {
    const r = createAppStateRepository(pool);
    await expect(
      r.appendNotificationLog(CONSUMERS.A, {
        alertId: null,
        kind: 'alert',
        channel: 'email',
        status: 'sent',
        attempt: 1,
        error: null,
      }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      r.appendNotificationLog(CONSUMERS.A, {
        alertId: null,
        kind: 'test',
        channel: 'email',
        status: 'sent',
        attempt: 0,
        error: null,
      }),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
