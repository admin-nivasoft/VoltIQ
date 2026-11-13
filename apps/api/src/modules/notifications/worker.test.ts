import { describe, expect, it } from 'vitest';
import type { AttemptPlan, ClaimedJob, ClaimOptions } from '../../data/index.ts';
import type { NotificationMessage, NotificationProvider } from './providers.ts';
import {
  BACKOFF_MS,
  buildAlertMessage,
  decideAfterAttempt,
  MAX_ATTEMPTS,
  NotificationWorker,
} from './worker.ts';

const T0 = new Date();
const plus = (ms: number) => new Date(T0.getTime() + ms);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('decideAfterAttempt (D-07: 3 attempts, backoff 1 s then 5 s)', () => {
  it('retries after 1 s, then 5 s, then fails for good', () => {
    expect(BACKOFF_MS).toEqual([1000, 5000, 25000]);
    expect(MAX_ATTEMPTS).toBe(3);
    expect(decideAfterAttempt(1, false)).toEqual({ status: 'retry', retryAfterMs: 1000 });
    expect(decideAfterAttempt(2, false)).toEqual({ status: 'retry', retryAfterMs: 5000 });
    expect(decideAfterAttempt(3, false)).toEqual({ status: 'failed', retryAfterMs: null });
  });
  it('success is final on any attempt', () => {
    for (const n of [1, 2, 3])
      expect(decideAfterAttempt(n, true)).toEqual({ status: 'sent', retryAfterMs: null });
  });
});

describe('buildAlertMessage', () => {
  it('uses only consumer-facing alert fields', () => {
    const job = {
      target: 'a@example.test',
      severity: 'high',
      title: 'T',
      description: 'D',
      recommendedAction: 'R',
    } as ClaimedJob;
    expect(buildAlertMessage(job)).toEqual({
      target: 'a@example.test',
      kind: 'alert',
      subject: '[High] T',
      body: 'D\n\nRecommended action: R',
    });
  });
});

type Rec = ClaimedJob & { status: string; due: number };

/** An in-memory outbox with the same rules as the database one: the attempt is counted when claimed. */
function fakeRepo(jobs: { id: string; target: string; attempts?: number }[], consumerIds = ['c1']) {
  const state = new Map<string, Rec>(
    jobs.map((j) => [
      j.id,
      {
        id: j.id,
        alertId: 'a1',
        userId: 'u1',
        channel: 'email',
        target: j.target,
        attempts: j.attempts ?? 0,
        severity: 'high',
        title: 'Title',
        description: 'Desc',
        recommendedAction: 'Act',
        status: 'pending',
        due: 0,
      },
    ]),
  );
  const log: { id: string; attempt: number; ok: boolean; error: string | null }[] = [];
  const repo = {
    state,
    log,
    failRecordFor: new Set<string>(),
    failClaimFor: new Set<string>(),
    listConsumerIds: async () => consumerIds,
    claimDueJobs: async (c: string, o: ClaimOptions) => {
      if (repo.failClaimFor.has(c)) throw new Error('db hiccup');
      const now = Date.now() + (o.shiftMs ?? 0);
      const out: ClaimedJob[] = [];
      for (const j of [...state.values()]
        .filter((x) => x.status === 'pending' && x.due <= now)
        .slice(0, o.limit)) {
        if (j.attempts >= o.maxAttempts) {
          j.status = 'failed';
          continue;
        }
        j.attempts += 1;
        j.due = now + o.leaseMs;
        out.push({ ...j });
      }
      return out;
    },
    releaseJobs: async (_c: string, jobs: ClaimedJob[], shiftMs = 0) => {
      for (const job of jobs) {
        const j = state.get(job.id)!;
        if (j.status === 'pending' && j.attempts === job.attempts) {
          j.attempts -= 1;
          j.due = Date.now() + shiftMs;
        }
      }
    },
    recordAttempt: async (
      _c: string,
      job: ClaimedJob,
      r: { ok: boolean; error: string | null },
      plan: AttemptPlan,
      shiftMs = 0,
    ) => {
      if (repo.failRecordFor.has(job.id)) throw new Error('db down');
      const j = state.get(job.id)!;
      if (j.status !== 'pending' || j.attempts !== job.attempts) return;
      log.push({ id: job.id, attempt: job.attempts, ok: r.ok, error: r.error });
      j.status = plan.status === 'retry' ? 'pending' : plan.status;
      if (plan.retryAfterMs !== null) j.due = Date.now() + shiftMs + plan.retryAfterMs;
    },
  };
  return repo;
}

const providers = (
  spy: NotificationMessage[],
  behaviour?: (m: NotificationMessage) => Promise<{ ok: boolean; error: string | null }>,
) => {
  const p: NotificationProvider = {
    channel: 'email',
    send: async (m) => {
      spy.push(m);
      return behaviour
        ? behaviour(m)
        : {
            ok: !m.target.includes('fail'),
            error: m.target.includes('fail') ? 'mock_delivery_failed' : null,
          };
    },
  };
  return {
    email: p,
    sms: { ...p, channel: 'sms' as const },
    webhook: { ...p, channel: 'webhook' as const },
  };
};
const make = (
  repo: ReturnType<typeof fakeRepo>,
  p: ReturnType<typeof providers>,
  extra: object = {},
  now?: () => Date,
) =>
  new NotificationWorker({ repo: repo as never, providers: p, ...(now ? { now } : {}), ...extra });

describe('NotificationWorker', () => {
  it('a failing target is tried 3 times with 1 s and 5 s backoff, then marked failed', async () => {
    const repo = fakeRepo([{ id: 'j1', target: 'fail@example.test' }]);
    const sent: NotificationMessage[] = [];
    let now = T0;
    const w = make(repo, providers(sent), {}, () => now);
    await w.tick();
    expect(repo.log).toHaveLength(1);
    now = plus(500);
    await w.tick();
    expect(repo.log).toHaveLength(1); // 1 s backoff not over
    now = plus(1100);
    await w.tick();
    expect(repo.log).toHaveLength(2);
    now = plus(1100 + 4000);
    await w.tick();
    expect(repo.log).toHaveLength(2); // 5 s backoff not over
    now = plus(1100 + 5200);
    await w.tick();
    expect(repo.log.map((l) => l.attempt)).toEqual([1, 2, 3]);
    expect(repo.state.get('j1')?.status).toBe('failed');
    now = plus(10 * 60_000);
    await w.tick();
    expect(repo.log).toHaveLength(3); // terminal: never retried again
    expect(sent).toHaveLength(3);
    expect(new Set(repo.log.map((l) => l.error))).toEqual(new Set(['mock_delivery_failed']));
  });

  it('a good target is sent once and never again (idempotent)', async () => {
    const repo = fakeRepo([{ id: 'j1', target: 'ok@example.test' }]);
    const sent: NotificationMessage[] = [];
    let now = T0;
    const w = make(repo, providers(sent), {}, () => now);
    for (const t of [0, 100, 5000, 60_000]) {
      now = plus(t);
      await w.tick();
    }
    expect(sent).toHaveLength(1);
    expect(repo.state.get('j1')?.status).toBe('sent');
  });

  it('a provider that throws is recorded as a failure with a fixed code', async () => {
    const repo = fakeRepo([{ id: 'j1', target: 'x@example.test' }]);
    const w = make(
      repo,
      providers([], async () => {
        throw new Error('https://secret.example/hook?token=abc exploded');
      }),
    );
    await w.tick();
    expect(repo.log[0]).toMatchObject({ ok: false, error: 'provider_error' });
  });

  it('a send that hangs is cut off after the timeout and counted as a failed attempt', async () => {
    const repo = fakeRepo([{ id: 'j1', target: 'x@example.test' }]);
    const w = make(
      repo,
      providers([], () => new Promise(() => {})),
      { sendTimeoutMs: 40 },
    );
    const t0 = Date.now();
    await w.tick();
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(repo.log[0]).toMatchObject({ ok: false, error: 'delivery_timeout' });
  });

  it('a job claimed but never recorded (crash) is retried after its lease, and the lost attempt still counts', async () => {
    const repo = fakeRepo([{ id: 'j1', target: 'ok@example.test' }]);
    const crashed = await repo.claimDueJobs('c1', { limit: 10, leaseMs: 30_000, maxAttempts: 3 }); // worker 1 claims, then dies
    expect(crashed[0]?.attempts).toBe(1);
    const sent: NotificationMessage[] = [];
    let now = plus(1000);
    const w2 = make(repo, providers(sent), { leaseMs: 30_000 }, () => now);
    await w2.tick();
    expect(sent).toHaveLength(0); // still leased
    now = plus(30_500);
    await w2.tick();
    expect(sent).toHaveLength(1);
    expect(repo.log[0]?.attempt).toBe(2); // the crashed try used up attempt 1
    expect(repo.state.get('j1')?.status).toBe('sent');
  });

  it('repeated crashes cannot cause endless resends: attempts run out and the job fails', async () => {
    const repo = fakeRepo([{ id: 'j1', target: 'ok@example.test' }]);
    for (let i = 0; i < 3; i++) {
      const got = await repo.claimDueJobs('c1', {
        limit: 10,
        leaseMs: 100,
        maxAttempts: 3,
        shiftMs: i * 1000,
      });
      expect(got).toHaveLength(1); // each claim "crashes" before recording
    }
    const sent: NotificationMessage[] = [];
    await make(repo, providers(sent), {}, () => plus(60_000)).tick();
    expect(sent).toHaveLength(0);
    expect(repo.state.get('j1')?.status).toBe('failed');
  });

  it('one consumer failing does not stop the others, and tick never throws', async () => {
    const repo = fakeRepo([{ id: 'j1', target: 'ok@example.test' }], ['broken', 'c1']);
    repo.failClaimFor.add('broken');
    const sent: NotificationMessage[] = [];
    await expect(make(repo, providers(sent)).tick()).resolves.toBeDefined();
    expect(sent).toHaveLength(1);
  });

  it('a throwing onError callback cannot crash the worker', async () => {
    const repo = fakeRepo([], ['broken']);
    repo.failClaimFor.add('broken');
    const w = make(repo, providers([]), {
      onError: () => {
        throw new Error('logger broke');
      },
    });
    await expect(w.tick()).resolves.toEqual({ processed: 0 });
  });

  it('a failing recordAttempt does not lose the other jobs: they are delivered after their lease', async () => {
    const repo = fakeRepo([
      { id: 'j1', target: 'a@example.test' },
      { id: 'j2', target: 'b@example.test' },
    ]);
    repo.failRecordFor.add('j1');
    const sent: NotificationMessage[] = [];
    let now = T0;
    const w = make(repo, providers(sent), { leaseMs: 1000 }, () => now);
    await w.tick(); // j1 sent but not recorded; the pass ends early
    repo.failRecordFor.clear();
    now = plus(1500);
    await w.tick();
    expect(repo.state.get('j2')?.status).toBe('sent');
    expect(repo.state.get('j1')?.status).toBe('sent');
  });

  it('does not start a send that could outlive the lease, and gives the unstarted jobs their attempt back', async () => {
    const jobs = Array.from({ length: 10 }, (_, i) => ({
      id: `j${i}`,
      target: `u${i}@example.test`,
    }));
    const repo = fakeRepo(jobs);
    const sent: NotificationMessage[] = [];
    const slow = providers(sent, async () => {
      await sleep(40);
      return { ok: true, error: null };
    });
    const w = make(repo, slow, { leaseMs: 250, sendTimeoutMs: 100 });
    await w.tick();
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.length).toBeLessThan(10); // stopped early
    const unsent = [...repo.state.values()].filter((j) => j.status === 'pending');
    expect(unsent.length).toBe(10 - sent.length);
    expect(unsent.every((j) => j.attempts === 0)).toBe(true); // attempts handed back, not burned
    for (let i = 0; i < 12 && sent.length < 10; i++) await w.tick();
    // Every job is eventually delivered exactly once, on its first attempt, and none is failed.
    expect(sent).toHaveLength(10);
    expect(repo.log.every((l) => l.attempt === 1 && l.ok)).toBe(true);
    expect([...repo.state.values()].every((j) => j.status === 'sent')).toBe(true);
  });

  it('stop() during a pass starts no new sends and hands back the unstarted jobs', async () => {
    const jobs = Array.from({ length: 6 }, (_, i) => ({
      id: `j${i}`,
      target: `u${i}@example.test`,
    }));
    const repo = fakeRepo(jobs);
    const sent: NotificationMessage[] = [];
    const w = make(
      repo,
      providers(sent, async () => {
        await sleep(50);
        return { ok: true, error: null };
      }),
    );
    const pass = w.tick();
    await sleep(70);
    await w.stop();
    await pass;
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.length).toBeLessThan(6);
    const unstarted = [...repo.state.values()].filter((j) => j.status === 'pending');
    expect(unstarted.length).toBe(6 - sent.length);
    expect(unstarted.every((j) => j.attempts === 0)).toBe(true);
  });

  it('aborts the provider call when it times out, so a late success cannot duplicate the retry', async () => {
    const repo = fakeRepo([{ id: 'j1', target: 'x@example.test' }]);
    let aborted = false;
    const p = providers([]);
    p.email = {
      channel: 'email',
      send: (_m, o) =>
        new Promise(() => {
          o?.signal?.addEventListener('abort', () => {
            aborted = true;
          });
        }),
    };
    await make(repo, p, { sendTimeoutMs: 30 }).tick();
    expect(aborted).toBe(true);
    expect(repo.log[0]).toMatchObject({ ok: false, error: 'delivery_timeout' });
  });

  it('refuses a configuration where a send plus recording could outlast the lease', () => {
    const repo = fakeRepo([]);
    expect(() => make(repo, providers([]), { leaseMs: 1000, sendTimeoutMs: 900 })).toThrow(
      /shorter than leaseMs/,
    );
    expect(() => make(repo, providers([]), { leaseMs: 30_000 })).not.toThrow();
  });

  it('a pass never overlaps itself, and stop() waits for the pass in progress', async () => {
    const repo = fakeRepo([{ id: 'j1', target: 'ok@example.test' }]);
    const sent: NotificationMessage[] = [];
    const w = make(
      repo,
      providers(sent, async () => {
        await sleep(80);
        return { ok: true, error: null };
      }),
    );
    const first = w.tick();
    expect(await w.tick()).toEqual({ processed: 0 }); // overlap is refused
    await sleep(20); // the send is now in progress
    const stopped = w.stop();
    await stopped;
    expect(sent).toHaveLength(1);
    expect(repo.state.get('j1')?.status).toBe('sent'); // stop() returned only after the pass finished
    await first;
  });

  it('stop() gives up waiting after its timeout instead of hanging shutdown', async () => {
    const repo = fakeRepo([{ id: 'j1', target: 'x@example.test' }]);
    const w = make(
      repo,
      providers([], () => new Promise(() => {})),
      { sendTimeoutMs: 5000, leaseMs: 60_000 },
    );
    void w.tick();
    await sleep(20);
    const t0 = Date.now();
    await w.stop(100);
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('the message sent holds only consumer-facing fields', async () => {
    const repo = fakeRepo([{ id: 'j1', target: 'ok@example.test' }]);
    const sent: NotificationMessage[] = [];
    await make(repo, providers(sent)).tick();
    expect(sent[0]).toEqual({
      target: 'ok@example.test',
      kind: 'alert',
      subject: '[High] Title',
      body: 'Desc\n\nRecommended action: Act',
    });
  });
});
