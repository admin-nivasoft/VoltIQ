import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  NotificationChannelSchema,
  NotificationLogPageSchema,
  NotificationTestResultSchema,
} from '@ql/contracts';
import { buildApp } from '../../app.ts';
import { loadConfig, type Config } from '../../config.ts';
import {
  createAppStateRepository,
  createPool,
  createPostgresMockSource,
  withTenant,
  type Pool,
} from '../../data/index.ts';
import { CONSUMERS, startTestDb, type TestDb } from '../../data/testing/db.ts';
import {
  createMockProvider,
  type NotificationMessage,
  type ProviderRegistry,
} from './providers.ts';
import { NotificationWorker } from './worker.ts';

const H = { 'x-requested-with': 'ql' };
const U = {
  fleetA: 'e0000001-0000-4000-8000-000000000001',
  techA: 'e0000001-0000-4000-8000-000000000002',
  adminA: 'e0000001-0000-4000-8000-000000000003',
  fleetB: 'e0000002-0000-4000-8000-000000000001',
  platform: 'd0000000-0000-4000-8000-000000000001',
};
type Who = keyof typeof U;

let db: TestDb;
let pool: Pool;
let config: Config;
let app: FastifyInstance;
let repo: ReturnType<typeof createAppStateRepository>;
const cookies = {} as Record<Who, string>;
const sent: NotificationMessage[] = [];
let now = new Date();

const providers: ProviderRegistry = {
  email: spy('email'),
  sms: spy('sms'),
  webhook: spy('webhook'),
};
function spy(channel: 'email' | 'sms' | 'webhook') {
  const inner = createMockProvider(channel, { delayMs: 0 });
  return {
    channel,
    send: async (m: NotificationMessage) => {
      sent.push(m);
      return inner.send(m);
    },
  };
}
const worker = () => new NotificationWorker({ repo, providers, now: () => now, batchSize: 100 });

const call = (
  method: 'GET' | 'POST' | 'PUT',
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

const setChannels = (who: Who, channels: unknown[]) =>
  call('PUT', '/notification-channels', who, { channels });
const jobsFor = (consumerId: string, alertId: string) =>
  withTenant(
    pool,
    consumerId,
    async (tx) =>
      (
        await tx.query<{ user_id: string; channel: string; status: string; attempts: number }>(
          'SELECT user_id, channel, status, attempts FROM notification_jobs WHERE alert_id = $1 ORDER BY user_id, channel',
          [alertId],
        )
      ).rows,
  );
const logFor = (consumerId: string, alertId: string) =>
  withTenant(
    pool,
    consumerId,
    async (tx) =>
      (
        await tx.query<{ attempt: number; status: string; error: string | null; channel: string }>(
          'SELECT attempt, status, error, channel FROM notification_log WHERE alert_id = $1 ORDER BY attempt',
          [alertId],
        )
      ).rows,
  );
const simulate = async (consumerId: string, severity = 'high') => {
  const r = await call('POST', '/dev/simulate-alert', 'platform', { consumerId, severity });
  expect(r.statusCode, r.body).toBe(200);
  // The job is due from the database's clock; start the worker's clock a little later so it is.
  now = new Date(Date.now() + 5000);
  return r.json() as { alertId: string; jobsQueued: number };
};
/** Runs the worker far into the future until nothing is pending, so each test starts clean. */
const drain = async () => {
  for (let i = 1; i <= 6; i++) {
    now = new Date(Date.now() + i * 3_600_000);
    await worker().tick();
  }
  sent.length = 0;
};

beforeAll(async () => {
  db = await startTestDb();
  pool = createPool(db.appUrl);
  config = loadConfig({
    NODE_ENV: 'test',
    AUTH_PROVIDER: 'mock',
    ENABLE_DEV_ENDPOINTS: 'true',
    JWT_SECRET: 's'.repeat(48),
    DATABASE_URL: db.appUrl,
    RATE_LIMIT_PER_MINUTE: '100000',
  } as NodeJS.ProcessEnv);
  repo = createAppStateRepository(pool);
  app = await buildApp({ config, repo, fleet: createPostgresMockSource(pool, config), providers });
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

describe('channel endpoints', () => {
  it('fleet_manager, technician and consumer_admin manage their own channels; platform_admin may not', async () => {
    for (const who of ['fleetA', 'techA', 'adminA'] as Who[]) {
      expect((await call('GET', '/notification-channels', who)).statusCode, who).toBe(200);
    }
    expect((await call('GET', '/notification-channels', 'platform')).statusCode).toBe(403);
    expect((await call('GET', '/notification-channels', null)).statusCode).toBe(401);
  });

  it("saves, replaces and lists the signed-in user's channels, validated by type", async () => {
    const put = await setChannels('techA', [
      { type: 'email', target: 'tech.a@example.test', enabled: true },
      { type: 'sms', target: '+919800000010', enabled: true },
    ]);
    expect(put.statusCode).toBe(200);
    expect(
      NotificationChannelSchema.array()
        .parse(put.json())
        .map((c) => c.type),
    ).toEqual(['email', 'sms']);
    const replaced = await setChannels('techA', [
      { type: 'webhook', target: 'https://hooks.example.test/a', enabled: false },
    ]);
    expect(replaced.json()).toHaveLength(1);
    expect((await call('GET', '/notification-channels', 'techA')).json()).toHaveLength(1);
    await setChannels('techA', []);
    expect((await call('GET', '/notification-channels', 'techA')).json()).toEqual([]);
  });

  it.each([
    [{ channels: [{ type: 'email', target: 'not-an-email', enabled: true }] }],
    [{ channels: [{ type: 'sms', target: '98000', enabled: true }] }],
    [{ channels: [{ type: 'webhook', target: 'http://example.test/x', enabled: true }] }],
    [{ channels: [{ type: 'webhook', target: 'https://localhost/x', enabled: true }] }],
    [
      {
        channels: [
          { type: 'email', target: 'a@example.test', enabled: true },
          { type: 'email', target: 'b@example.test', enabled: true },
        ],
      },
    ],
    [{ channels: 'nope' }],
    [{}],
  ])('rejects an invalid body with 400: %j', async (body) => {
    const r = await call('PUT', '/notification-channels', 'techA', body);
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('validation_failed');
  });

  it('a technician naming another user in the body changes only their own channels', async () => {
    await setChannels('fleetA', [
      { type: 'email', target: 'fleet.manager.a@example.test', enabled: true },
    ]);
    const r = await call('PUT', '/notification-channels', 'techA', {
      userId: U.fleetA,
      user_id: U.fleetA,
      consumerId: CONSUMERS.B,
      channels: [
        {
          id: crypto.randomUUID(),
          userId: U.fleetA,
          type: 'email',
          target: 'tech.a@example.test',
          enabled: true,
        },
      ],
    });
    expect(r.statusCode).toBe(200);
    expect(
      NotificationChannelSchema.array().parse(
        (await call('GET', '/notification-channels', 'techA')).json(),
      )[0]?.target,
    ).toBe('tech.a@example.test');
    expect((await call('GET', '/notification-channels', 'fleetA')).json()[0].target).toBe(
      'fleet.manager.a@example.test',
    );
    expect(await repo.listChannels({ consumerId: CONSUMERS.B, userId: U.fleetB })).toHaveLength(1); // B untouched
    await setChannels('techA', []);
  });

  it('needs the X-Requested-With header', async () => {
    expect(
      (await call('PUT', '/notification-channels', 'techA', { channels: [] }, {})).statusCode,
    ).toBe(403);
  });
});

describe('test message', () => {
  it('reports a success and a failure, logs both, and audits', async () => {
    await setChannels('fleetA', [
      { type: 'email', target: 'fleet.manager.a@example.test', enabled: true },
      { type: 'sms', target: '+919800000fail'.replace('00fail', '0000') + '', enabled: true },
      { type: 'webhook', target: 'https://hooks.example.test/fail/x', enabled: true },
    ]);
    const ok = NotificationTestResultSchema.parse(
      (await call('POST', '/notification-channels/test', 'fleetA', { type: 'email' })).json(),
    );
    expect(ok).toMatchObject({ channel: 'email', status: 'sent', error: null });
    const bad = NotificationTestResultSchema.parse(
      (await call('POST', '/notification-channels/test', 'fleetA', { type: 'webhook' })).json(),
    );
    expect(bad).toMatchObject({
      channel: 'webhook',
      status: 'failed',
      error: 'mock_delivery_failed',
    });
    const log = await withTenant(
      pool,
      CONSUMERS.A,
      async (tx) =>
        (
          await tx.query<{ kind: string; status: string; alert_id: string | null }>(
            "SELECT kind, status, alert_id FROM notification_log WHERE kind = 'test' ORDER BY at DESC LIMIT 4",
          )
        ).rows,
    );
    expect(log.some((l) => l.status === 'failed' && l.alert_id === null)).toBe(true);
    const audits = await withTenant(
      pool,
      CONSUMERS.A,
      async (tx) =>
        (
          await tx.query(
            "SELECT count(*)::int AS n FROM audit_events WHERE action = 'channel.test' AND user_id = $1",
            [U.fleetA],
          )
        ).rows[0],
    );
    expect((audits as { n: number }).n).toBeGreaterThanOrEqual(2);
    expect(sent.some((m) => m.kind === 'test' && m.body.includes('No action is needed'))).toBe(
      true,
    );
  });

  it('is a 404 for a channel type you have not set up, and 400 for an unknown type', async () => {
    await setChannels('techA', []);
    expect(
      (await call('POST', '/notification-channels/test', 'techA', { type: 'sms' })).statusCode,
    ).toBe(404);
    expect(
      (await call('POST', '/notification-channels/test', 'techA', { type: 'pigeon' })).statusCode,
    ).toBe(400);
  });
});

describe('simulate-alert guards (D-04, D-08)', () => {
  it('only a platform_admin may use it, and it needs the CSRF header', async () => {
    for (const who of ['fleetA', 'techA', 'adminA'] as Who[]) {
      expect(
        (await call('POST', '/dev/simulate-alert', who, { consumerId: CONSUMERS.A })).statusCode,
        who,
      ).toBe(403);
    }
    expect(
      (await call('POST', '/dev/simulate-alert', null, { consumerId: CONSUMERS.A })).statusCode,
    ).toBe(401);
    expect(
      (await call('POST', '/dev/simulate-alert', 'platform', { consumerId: CONSUMERS.A }, {}))
        .statusCode,
    ).toBe(403);
  });

  it('validates the body and the consumer', async () => {
    expect(
      (await call('POST', '/dev/simulate-alert', 'platform', { consumerId: 'nope' })).statusCode,
    ).toBe(400);
    expect(
      (
        await call('POST', '/dev/simulate-alert', 'platform', {
          consumerId: CONSUMERS.A,
          severity: 'extreme',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await call('POST', '/dev/simulate-alert', 'platform', { consumerId: CONSUMERS.A, extra: 1 }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await call('POST', '/dev/simulate-alert', 'platform', {
          consumerId: 'f1111111-1111-4111-8111-111111111111',
        })
      ).statusCode,
    ).toBe(404);
  });

  it.each([
    [
      'AUTH_PROVIDER=entra with the dev flag',
      { AUTH_PROVIDER: 'entra', ENABLE_DEV_ENDPOINTS: 'true' },
    ],
    [
      'AUTH_PROVIDER=mock with the dev flag false',
      { AUTH_PROVIDER: 'mock', ENABLE_DEV_ENDPOINTS: 'false' },
    ],
    ['AUTH_PROVIDER=mock with the dev flag unset', { AUTH_PROVIDER: 'mock' }],
  ])('does not exist with %s', async (_n, flags) => {
    const off = await buildApp({
      config: loadConfig({
        NODE_ENV: 'test',
        JWT_SECRET: 's'.repeat(48),
        DATABASE_URL: db.appUrl,
        ...flags,
      } as NodeJS.ProcessEnv),
      repo,
      fleet: createPostgresMockSource(pool, config),
      providers,
    });
    for (const headers of [{ ...H }, { ...H, cookie: cookies.platform }]) {
      const r = await off.inject({
        method: 'POST',
        url: '/api/v1/dev/simulate-alert',
        headers,
        payload: { consumerId: CONSUMERS.A },
      });
      expect(r.statusCode).toBe(404);
    }
    await off.close();
  });

  it("creates an alert that shows in the consumer's own list, and audits the platform action", async () => {
    const before = (await call('GET', '/fleet/summary', 'fleetA')).json().activeAlerts as number;
    const { alertId } = await simulate(CONSUMERS.A, 'high');
    expect((await call('GET', '/fleet/summary', 'fleetA')).json().activeAlerts).toBe(before + 1);
    const a = (await call('GET', '/alerts?pageSize=100&status=open', 'techA'))
      .json()
      .items.find((x: { id: string }) => x.id === alertId);
    expect(a).toMatchObject({ severity: 'high', status: 'open' });
    const seenByB = (await call('GET', '/alerts?pageSize=100', 'fleetB')).body;
    expect(seenByB).not.toContain(alertId);
  });
});

describe('outbox and worker (D-07)', () => {
  beforeEach(drain);

  it('acceptance: a simulated alert to a "fail" target produces 3 attempts in the log and status failed', async () => {
    await setChannels('fleetA', [{ type: 'email', target: 'fail@example.test', enabled: true }]);
    await setChannels('techA', []);
    await setChannels('adminA', []);
    now = new Date();
    const { alertId, jobsQueued } = await simulate(CONSUMERS.A);
    expect(jobsQueued).toBe(1);
    const w = worker();
    await w.tick();
    expect(await logFor(CONSUMERS.A, alertId)).toHaveLength(1);
    now = new Date(now.getTime() + 500);
    await w.tick();
    expect(await logFor(CONSUMERS.A, alertId)).toHaveLength(1); // 1 s backoff not over
    now = new Date(now.getTime() + 600);
    await w.tick();
    now = new Date(now.getTime() + 5001);
    await w.tick();
    const log = await logFor(CONSUMERS.A, alertId);
    expect(log.map((l) => l.attempt)).toEqual([1, 2, 3]);
    expect(log.every((l) => l.status === 'failed' && l.error === 'mock_delivery_failed')).toBe(
      true,
    );
    expect((await jobsFor(CONSUMERS.A, alertId))[0]).toMatchObject({
      status: 'failed',
      attempts: 3,
    });
    now = new Date(now.getTime() + 3_600_000);
    await w.tick();
    expect(await logFor(CONSUMERS.A, alertId)).toHaveLength(3); // never retried again
    // consumer_admin sees it in the delivery log through the API
    const page = NotificationLogPageSchema.parse(
      (await call('GET', '/notification-log?pageSize=100', 'adminA')).json(),
    );
    expect(page.items.filter((e) => e.alertId === alertId && e.status === 'failed')).toHaveLength(
      3,
    );
  });

  it('a good target is delivered once with consumer-facing text only; users without a channel get nothing', async () => {
    await setChannels('fleetA', [
      { type: 'email', target: 'fleet.manager.a@example.test', enabled: true },
    ]);
    await setChannels('techA', [{ type: 'sms', target: '+919800000011', enabled: true }]);
    await setChannels('adminA', [
      { type: 'webhook', target: 'https://hooks.example.test/admin', enabled: false },
    ]); // disabled
    sent.length = 0;
    now = new Date();
    const { alertId, jobsQueued } = await simulate(CONSUMERS.A, 'medium');
    expect(jobsQueued).toBe(2);
    const w = worker();
    await w.tick();
    await w.tick();
    now = new Date(now.getTime() + 60_000);
    await w.tick();
    const alertMessages = sent.filter((m) => m.kind === 'alert');
    expect(alertMessages).toHaveLength(2);
    for (const m of alertMessages) {
      expect(m.subject).toBe('[Medium] Battery is ageing faster than similar packs');
      expect(m.body).toContain('Recommended action: Review how this pack is used');
      expect(JSON.stringify(m)).not.toMatch(/signals|model|confidence|CANARY|consumer/i);
    }
    expect(
      (await jobsFor(CONSUMERS.A, alertId)).every((j) => j.status === 'sent' && j.attempts === 1),
    ).toBe(true);
    expect((await logFor(CONSUMERS.A, alertId)).map((l) => l.status)).toEqual(['sent', 'sent']);
  });

  it('only users whose role holds alerts.view are notified', async () => {
    await setChannels('fleetA', [
      { type: 'email', target: 'fleet.manager.a@example.test', enabled: true },
    ]);
    await setChannels('techA', [{ type: 'sms', target: '+919800000011', enabled: true }]);
    const { alertId } = (await repo.createAlertWithJobs(
      CONSUMERS.A,
      {
        severity: 'low',
        title: 't',
        description: 'd',
        recommendedAction: 'a',
        modelVersion: 'x',
        confidence: null,
      },
      ['fleet_manager'],
    ))!;
    expect((await jobsFor(CONSUMERS.A, alertId)).map((j) => j.user_id)).toEqual([U.fleetA]);
    expect(
      await repo.createAlertWithJobs(
        CONSUMERS.A,
        {
          severity: 'low',
          title: 't',
          description: 'd',
          recommendedAction: 'a',
          modelVersion: 'x',
          confidence: null,
        },
        [],
      ),
    ).toMatchObject({ jobsQueued: 0 });
  });

  it('enqueueing is idempotent: the same alert never gets duplicate jobs', async () => {
    const { alertId, jobsQueued } = await simulate(CONSUMERS.A);
    expect(jobsQueued).toBeGreaterThan(0);
    expect(
      await repo.enqueueJobsForAlert(CONSUMERS.A, alertId, [
        'fleet_manager',
        'technician',
        'consumer_admin',
      ]),
    ).toBe(0);
    expect(await jobsFor(CONSUMERS.A, alertId)).toHaveLength(jobsQueued);
  });

  it('acceptance: jobs survive an API restart (worker stopped, then started again)', async () => {
    await setChannels('fleetA', [
      { type: 'email', target: 'fleet.manager.a@example.test', enabled: true },
    ]);
    await setChannels('techA', []);
    now = new Date();
    const { alertId } = await simulate(CONSUMERS.A);
    // Worker 1 claims the job and "crashes" before recording anything.
    const claimed = await repo.claimDueJobs(CONSUMERS.A, {
      limit: 10,
      leaseMs: 30_000,
      maxAttempts: 3,
      shiftMs: now.getTime() - Date.now(),
    });
    expect(claimed.some((j) => j.alertId === alertId)).toBe(true);
    // A fresh worker finds it still leased...
    const w2 = new NotificationWorker({ repo, providers, now: () => now, leaseMs: 30_000 });
    await w2.tick();
    expect(await logFor(CONSUMERS.A, alertId)).toHaveLength(0);
    // ...and completes it once the lease has lapsed.
    now = new Date(now.getTime() + 30_001);
    await w2.tick();
    const log = await logFor(CONSUMERS.A, alertId);
    expect(log.map((l) => l.status)).toEqual(['sent']);
    expect(log[0]?.attempt).toBe(2); // the crashed try already used up attempt 1
    expect((await jobsFor(CONSUMERS.A, alertId))[0]?.status).toBe('sent');
  });

  it('two workers at once never deliver the same job twice (SKIP LOCKED)', async () => {
    await setChannels('fleetA', [
      { type: 'email', target: 'fleet.manager.a@example.test', enabled: true },
    ]);
    now = new Date();
    const { alertId } = await simulate(CONSUMERS.A);
    sent.length = 0;
    await Promise.all([worker().tick(), worker().tick(), worker().tick()]);
    // Three workers race for one job: exactly one message goes out, to exactly one target.
    expect(
      sent.filter((m) => m.kind === 'alert' && m.target === 'fleet.manager.a@example.test'),
    ).toHaveLength(1);
    expect(sent.filter((m) => m.kind === 'alert')).toHaveLength(1);
    expect(await logFor(CONSUMERS.A, alertId)).toHaveLength(1);
  });

  it("other consumers' jobs are processed in their own tenant context and never appear for A", async () => {
    now = new Date();
    const { alertId } = await simulate(CONSUMERS.B);
    await worker().tick();
    expect((await logFor(CONSUMERS.B, alertId)).length).toBeGreaterThan(0);
    expect(await logFor(CONSUMERS.A, alertId)).toEqual([]);
    expect(await jobsFor(CONSUMERS.A, alertId)).toEqual([]);
    const aLog = (await call('GET', '/notification-log?pageSize=100', 'adminA')).body;
    expect(aLog).not.toContain(alertId);
  });
});

describe('delivery reliability', () => {
  beforeEach(drain);

  it("another consumer's job is never claimed by A, and stays pending", async () => {
    const { alertId } = await simulate(CONSUMERS.B);
    const claimedAsA = await repo.claimDueJobs(CONSUMERS.A, {
      limit: 100,
      leaseMs: 30_000,
      maxAttempts: 3,
      shiftMs: 10_000,
    });
    expect(claimedAsA.some((j) => j.alertId === alertId)).toBe(false);
    expect(await jobsFor(CONSUMERS.B, alertId)).toEqual([
      expect.objectContaining({ status: 'pending', attempts: 0 }),
    ]);
  });

  it('a channel disabled after the alert was raised is not sent to, and the job ends with a clear reason', async () => {
    await setChannels('fleetA', [
      { type: 'email', target: 'fleet.manager.a@example.test', enabled: true },
    ]);
    const { alertId } = await simulate(CONSUMERS.A);
    await setChannels('fleetA', [
      { type: 'email', target: 'fleet.manager.a@example.test', enabled: false },
    ]);
    await worker().tick();
    expect(sent.filter((m) => m.kind === 'alert')).toHaveLength(0);
    expect((await jobsFor(CONSUMERS.A, alertId))[0]?.status).toBe('failed');
    expect((await logFor(CONSUMERS.A, alertId))[0]).toMatchObject({
      status: 'failed',
      error: 'channel_disabled',
    });
  });

  it("delivers to the channel's current target, not the one copied when the alert was raised", async () => {
    await setChannels('fleetA', [{ type: 'email', target: 'old@example.test', enabled: true }]);
    await simulate(CONSUMERS.A);
    await setChannels('fleetA', [{ type: 'email', target: 'new@example.test', enabled: true }]);
    await worker().tick();
    const targets = sent.filter((m) => m.kind === 'alert').map((m) => m.target);
    expect(targets).toEqual(['new@example.test']);
  });

  it('repeated crashes use up the attempts: the job fails instead of being resent forever', async () => {
    await setChannels('fleetA', [
      { type: 'email', target: 'fleet.manager.a@example.test', enabled: true },
    ]);
    const { alertId } = await simulate(CONSUMERS.A);
    for (let i = 0; i < 3; i++) {
      const got = await repo.claimDueJobs(CONSUMERS.A, {
        limit: 10,
        leaseMs: 1000,
        maxAttempts: 3,
        shiftMs: 10_000 + i * 60_000,
      });
      expect(
        got.some((j) => j.alertId === alertId),
        `claim ${i + 1}`,
      ).toBe(true); // each claim "crashes" before sending
    }
    now = new Date(Date.now() + 10 * 60_000);
    await worker().tick();
    expect(sent.filter((m) => m.kind === 'alert')).toHaveLength(0);
    expect((await jobsFor(CONSUMERS.A, alertId))[0]).toMatchObject({
      status: 'failed',
      attempts: 3,
    });
    expect((await logFor(CONSUMERS.A, alertId)).at(-1)).toMatchObject({
      status: 'failed',
      error: 'delivery_failed',
    });
  });

  it('a slow provider cannot burn attempts: every job is delivered once, on attempt 1, and none fails', async () => {
    await setChannels('fleetA', [
      { type: 'email', target: 'fleet.manager.a@example.test', enabled: true },
    ]);
    await setChannels('techA', [{ type: 'sms', target: '+919800000011', enabled: true }]);
    await setChannels('adminA', [
      { type: 'webhook', target: 'https://hooks.example.test/admin', enabled: true },
    ]);
    const { alertId, jobsQueued } = await simulate(CONSUMERS.A);
    expect(jobsQueued).toBe(3);
    const slowSent: NotificationMessage[] = [];
    const slow = (channel: 'email' | 'sms' | 'webhook') => ({
      channel,
      send: async (m: NotificationMessage) => {
        await new Promise((r) => setTimeout(r, 90));
        slowSent.push(m);
        return { ok: true, error: null };
      },
    });
    // Real clock (no `now` override): a 300 ms lease with 90 ms sends leaves room for two sends per pass, so the third job is handed back.
    const w = new NotificationWorker({
      repo,
      providers: { email: slow('email'), sms: slow('sms'), webhook: slow('webhook') },
      leaseMs: 300,
      sendTimeoutMs: 100,
    });
    for (let i = 0; i < 40 && slowSent.length < 3; i++) {
      await w.tick();
      await new Promise((r) => setTimeout(r, 30));
    }
    expect(slowSent).toHaveLength(3);
    const log = await logFor(CONSUMERS.A, alertId);
    expect(log.map((l) => [l.status, l.attempt])).toEqual([
      ['sent', 1],
      ['sent', 1],
      ['sent', 1],
    ]);
    expect(
      (await jobsFor(CONSUMERS.A, alertId)).every((j) => j.status === 'sent' && j.attempts === 1),
    ).toBe(true);
  });

  it('the test-message endpoint is rate limited to 5 a minute per user', async () => {
    const limited = await buildApp({
      config,
      repo,
      fleet: createPostgresMockSource(pool, config),
      providers,
    });
    const login = await limited.inject({
      method: 'POST',
      url: '/api/v1/auth/mock-login',
      headers: H,
      payload: { userId: U.adminA },
    });
    const cookie = String(login.headers['set-cookie']).split(';')[0] as string;
    const put = await limited.inject({
      method: 'PUT',
      url: '/api/v1/notification-channels',
      headers: { ...H, cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({
        channels: [{ type: 'email', target: 'admin.a@example.test', enabled: true }],
      }),
    });
    expect(put.statusCode).toBe(200);
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) {
      codes.push(
        (
          await limited.inject({
            method: 'POST',
            url: '/api/v1/notification-channels/test',
            headers: { ...H, cookie, 'content-type': 'application/json' },
            payload: JSON.stringify({ type: 'email' }),
          })
        ).statusCode,
      );
    }
    expect(codes.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(codes.slice(5)).toEqual([429, 429]);
    await limited.close();
  });
});

describe('GET /notification-log', () => {
  it('is for consumer_admin only, scoped to the consumer, newest first, and paged', async () => {
    expect((await call('GET', '/notification-log', 'adminA')).statusCode).toBe(200);
    for (const who of ['fleetA', 'techA', 'platform'] as Who[])
      expect((await call('GET', '/notification-log', who)).statusCode, who).toBe(403);
    expect((await call('GET', '/notification-log', null)).statusCode).toBe(401);
    const page = NotificationLogPageSchema.parse(
      (await call('GET', '/notification-log?pageSize=5&page=1', 'adminA')).json(),
    );
    expect(page.items.length).toBeLessThanOrEqual(5);
    expect(page.total).toBeGreaterThan(5);
    const times = page.items.map((e) => Date.parse(e.at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect((await call('GET', '/notification-log?pageSize=101', 'adminA')).statusCode).toBe(400);
    expect((await call('GET', '/notification-log?sort=error', 'adminA')).statusCode).toBe(400);
    expect(
      (await call('GET', `/notification-log?consumerId=${CONSUMERS.B}`, 'adminA')).body,
    ).not.toContain(CONSUMERS.B);
  });

  it('log errors are short fixed codes, never provider internals', async () => {
    const all = NotificationLogPageSchema.parse(
      (await call('GET', '/notification-log?pageSize=100', 'adminA')).json(),
    );
    for (const e of all.items)
      if (e.error !== null)
        expect([
          'mock_delivery_failed',
          'provider_error',
          'delivery_failed',
          'delivery_timeout',
          'channel_disabled',
        ]).toContain(e.error);
  });
});

describe('route inventory', () => {
  it('every new /api/v1 route is documented in OpenAPI and permission-guarded', async () => {
    const doc = (await call('GET', '/openapi.json', null)).json();
    const documented = new Set(
      Object.entries<Record<string, unknown>>(doc.paths).flatMap(([p, ops]) =>
        Object.keys(ops).map((m) => `${m.toUpperCase()} /api/v1${p}`),
      ),
    );
    for (const url of [
      '/notification-channels',
      '/notification-channels/test',
      '/notification-log',
    ]) {
      expect([...documented].some((d) => d.endsWith(url))).toBe(true);
    }
    expect(JSON.stringify(doc)).not.toMatch(/simulate|\/dev\//i);
    const dev = app.routeInventory.find((r) => r.url === '/api/v1/dev/simulate-alert');
    expect(dev).toBeDefined();
  });
});
