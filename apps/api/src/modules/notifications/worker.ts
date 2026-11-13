import type { AppStateRepository, AttemptPlan, ClaimedJob } from '../../data/index.ts';
import { sanitizeError, type NotificationMessage, type ProviderRegistry } from './providers.ts';

/** D-07: up to 3 attempts. After a failure, wait 1 s before attempt 2 and 5 s before attempt 3 (25 s is reserved for a 4th). */
export const BACKOFF_MS: readonly number[] = [1000, 5000, 25000];
export const MAX_ATTEMPTS = 3;

/** `attemptNo` is the number of the attempt that just finished (the job's claimed attempt count). */
export function decideAfterAttempt(
  attemptNo: number,
  ok: boolean,
  backoff: readonly number[] = BACKOFF_MS,
  max = MAX_ATTEMPTS,
): AttemptPlan {
  if (ok) return { status: 'sent', retryAfterMs: null };
  if (attemptNo >= max) return { status: 'failed', retryAfterMs: null };
  return {
    status: 'retry',
    retryAfterMs: backoff[Math.min(attemptNo - 1, backoff.length - 1)] ?? 1000,
  };
}

const SEVERITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' } as const;

/** Message text comes only from the alert's consumer-facing fields (D-07). */
export function buildAlertMessage(
  job: Pick<ClaimedJob, 'target' | 'severity' | 'title' | 'description' | 'recommendedAction'>,
): NotificationMessage {
  return {
    target: job.target,
    kind: 'alert',
    subject: `[${SEVERITY_LABEL[job.severity]}] ${job.title}`,
    body: `${job.description}\n\nRecommended action: ${job.recommendedAction}`,
  };
}

type WorkerRepo = Pick<
  AppStateRepository,
  'listConsumerIds' | 'claimDueJobs' | 'releaseJobs' | 'recordAttempt'
>;

export interface WorkerOptions {
  repo: WorkerRepo;
  providers: ProviderRegistry;
  /** Test hook only. In production leave it unset: all timing then uses the database clock. */
  now?: () => Date;
  intervalMs?: number;
  batchSize?: number;
  /** How long a claimed job stays invisible to other workers. */
  leaseMs?: number;
  /** A send that takes longer counts as a failed attempt. Defaults to min(10 s, half the lease). */
  sendTimeoutMs?: number;
  backoffMs?: readonly number[];
  onError?: (err: unknown) => void;
}

/**
 * Polls the outbox consumer by consumer (list_consumer_ids, then withTenant inside the repository),
 * so each consumer's jobs are handled in that consumer's own tenant context (D-04, D-07).
 */
export class NotificationWorker {
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<unknown> | null = null;
  private readonly leaseMs: number;
  private readonly sendTimeoutMs: number;

  private stopping = false;
  /** Time reserved after a send to write its result before the lease can lapse. */
  private readonly recordBudgetMs: number;

  constructor(private readonly o: WorkerOptions) {
    this.leaseMs = o.leaseMs ?? 30_000;
    this.sendTimeoutMs = o.sendTimeoutMs ?? Math.min(10_000, this.leaseMs / 4);
    this.recordBudgetMs = Math.min(5_000, this.leaseMs / 4);
    if (this.sendTimeoutMs + this.recordBudgetMs >= this.leaseMs) {
      throw new Error(
        'NotificationWorker: sendTimeoutMs plus the recording budget must be shorter than leaseMs',
      );
    }
  }

  private report(err: unknown): void {
    try {
      this.o.onError?.(err);
    } catch {
      // A broken error callback must never take the worker down.
    }
  }

  private shiftMs(): number {
    return this.o.now ? this.o.now().getTime() - Date.now() : 0;
  }

  /** One pass over every consumer. Never throws: a failure for one consumer must not stop the rest. */
  async tick(): Promise<{ processed: number }> {
    if (this.inFlight) return { processed: 0 }; // never overlap with ourselves
    const run = this.run();
    this.inFlight = run;
    try {
      return await run;
    } finally {
      this.inFlight = null;
    }
  }

  private async run(): Promise<{ processed: number }> {
    let processed = 0;
    let consumers: string[];
    try {
      consumers = await this.o.repo.listConsumerIds();
    } catch (err) {
      this.report(err);
      return { processed };
    }
    for (const consumerId of consumers) {
      if (this.stopping) break;
      let jobs: ClaimedJob[] = [];
      let started = 0;
      try {
        // The lease clock starts before the claim: the claim's own duration counts against it.
        const claimedAt = Date.now();
        jobs = await this.o.repo.claimDueJobs(consumerId, {
          limit: this.o.batchSize ?? 25,
          leaseMs: this.leaseMs,
          maxAttempts: MAX_ATTEMPTS,
          shiftMs: this.shiftMs(),
        });
        for (const job of jobs) {
          // Never start a send that could still be running, or still be unrecorded, when the lease
          // lapses: another replica would claim the job and deliver it again.
          if (
            this.stopping ||
            Date.now() - claimedAt + this.sendTimeoutMs + this.recordBudgetMs >= this.leaseMs
          )
            break;
          started++;
          await this.deliver(consumerId, job);
          processed++;
        }
      } catch (err) {
        this.report(err);
      }
      // Jobs claimed but never started get their attempt back, so a slow provider cannot burn attempts.
      const unstarted = jobs.slice(started);
      if (unstarted.length) {
        try {
          await this.o.repo.releaseJobs(consumerId, unstarted, this.shiftMs());
        } catch (err) {
          this.report(err);
        }
      }
    }
    return { processed };
  }

  private async send(job: ClaimedJob): Promise<{ ok: boolean; error: string | null }> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<{ ok: false; error: string }>((resolve) => {
      timer = setTimeout(() => {
        controller.abort(); // tell the provider to stop, so a late success cannot duplicate the retry
        resolve({ ok: false, error: 'delivery_timeout' });
      }, this.sendTimeoutMs);
    });
    try {
      const r = await Promise.race([
        this.o.providers[job.channel].send(buildAlertMessage(job), { signal: controller.signal }),
        timeout,
      ]);
      return { ok: r.ok, error: r.ok ? null : sanitizeError(r.error) };
    } catch (err) {
      return { ok: false, error: sanitizeError(err) };
    } finally {
      clearTimeout(timer);
    }
  }

  private async deliver(consumerId: string, job: ClaimedJob): Promise<void> {
    const result = await this.send(job);
    const plan = decideAfterAttempt(job.attempts, result.ok, this.o.backoffMs);
    await this.o.repo.recordAttempt(consumerId, job, result, plan, this.shiftMs());
  }

  start(): void {
    if (this.timer) return;
    this.stopping = false;
    this.timer = setInterval(() => {
      this.tick().catch((err) => this.report(err));
    }, this.o.intervalMs ?? 1000);
    this.timer.unref();
  }

  /** Stops polling and waits (up to timeoutMs) for a pass in progress to finish. */
  async stop(timeoutMs = 10_000): Promise<void> {
    this.stopping = true; // a pass in progress claims and starts nothing new
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!this.inFlight) return;
    await Promise.race([
      this.inFlight.catch(() => {}),
      new Promise((r) => setTimeout(r, timeoutMs).unref()),
    ]);
  }
}
