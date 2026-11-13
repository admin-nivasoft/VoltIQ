import type { Role } from '@ql/contracts';
import { UUID_RE } from './alert-sql.ts';
import type { Pool } from './pool.ts';
import { withTenant, type Tx } from './tenant.ts';
import type { AppStateRepository, ClaimedJob } from './types.ts';

type OutboxMethods = Pick<
  AppStateRepository,
  | 'createAlertWithJobs'
  | 'enqueueJobsForAlert'
  | 'claimDueJobs'
  | 'releaseJobs'
  | 'recordAttempt'
  | 'recordTestSend'
>;

async function enqueue(
  tx: Tx,
  consumerId: string,
  alertId: string,
  roles: Role[],
): Promise<number> {
  if (roles.length === 0) return 0;
  // One job per enabled channel of each eligible user. The composite join keeps users and channels in this consumer.
  const r = await tx.query(
    `INSERT INTO notification_jobs (consumer_id, alert_id, user_id, channel, target)
     SELECT c.consumer_id, $2, c.user_id, c.type, c.target
       FROM notification_channels c
       JOIN users u ON u.id = c.user_id AND u.consumer_id = c.consumer_id
      WHERE c.consumer_id = $1 AND c.enabled AND u.role = ANY($3::text[])
     ON CONFLICT (consumer_id, alert_id, user_id, channel) DO NOTHING`,
    [consumerId, alertId, roles],
  );
  return r.rowCount ?? 0;
}

type Channel = ClaimedJob['channel'];

export function createOutboxMethods(pool: Pool): OutboxMethods {
  return {
    async createAlertWithJobs(consumerId, a, notifyRoles) {
      if (a.packId !== undefined && !UUID_RE.test(a.packId)) return null;
      return withTenant(pool, consumerId, async (tx) => {
        const pack = a.packId
          ? (
              await tx.query<{ id: string }>(
                "SELECT id FROM packs WHERE id = $1 AND consumer_id = $2 AND status = 'in_service'",
                [a.packId, consumerId],
              )
            ).rows[0]
          : (
              await tx.query<{ id: string }>(
                "SELECT id FROM packs WHERE consumer_id = $1 AND status = 'in_service' ORDER BY random() LIMIT 1",
                [consumerId],
              )
            ).rows[0];
        if (!pack) return null;
        const ins = await tx.query<{ id: string }>(
          `INSERT INTO alerts (consumer_id, pack_id, severity, title, description, recommended_action, model_version, confidence)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [
            consumerId,
            pack.id,
            a.severity,
            a.title,
            a.description,
            a.recommendedAction,
            a.modelVersion,
            a.confidence,
          ],
        );
        const alertId = ins.rows[0]!.id;
        return { alertId, jobsQueued: await enqueue(tx, consumerId, alertId, notifyRoles) };
      });
    },

    async enqueueJobsForAlert(consumerId, alertId, notifyRoles) {
      if (!UUID_RE.test(alertId)) return 0;
      return withTenant(pool, consumerId, async (tx) => {
        const own = await tx.query('SELECT 1 FROM alerts WHERE id = $1 AND consumer_id = $2', [
          alertId,
          consumerId,
        ]);
        return own.rows.length ? enqueue(tx, consumerId, alertId, notifyRoles) : 0;
      });
    },

    async claimDueJobs(consumerId, { limit, leaseMs, maxAttempts, shiftMs = 0 }) {
      return withTenant(pool, consumerId, async (tx) => {
        // Everything is judged by the database clock (plus an optional test shift).
        const due = await tx.query<{
          id: string;
          alert_id: string;
          user_id: string;
          channel: Channel;
          attempts: number;
          current_target: string | null;
          enabled: boolean | null;
          severity: ClaimedJob['severity'];
          title: string;
          description: string;
          recommended_action: string;
        }>(
          `SELECT j.id, j.alert_id, j.user_id, j.channel, j.attempts,
                  c.target AS current_target, c.enabled,
                  a.severity, a.title, a.description, a.recommended_action
             FROM notification_jobs j
             JOIN alerts a ON a.id = j.alert_id AND a.consumer_id = j.consumer_id
             LEFT JOIN notification_channels c
                    ON c.consumer_id = j.consumer_id AND c.user_id = j.user_id AND c.type = j.channel
            WHERE j.consumer_id = $1 AND j.status = 'pending'
              AND j.next_attempt_at <= now() + make_interval(secs => $2::double precision)
            ORDER BY j.next_attempt_at, j.id
            LIMIT $3
              FOR UPDATE OF j SKIP LOCKED`,
          [consumerId, shiftMs / 1000, limit],
        );

        const live: typeof due.rows = [];
        const finish = async (row: (typeof due.rows)[number], error: string) => {
          // Out of attempts, or the user turned the channel off or removed it: end the job, say why.
          await tx.query(
            "UPDATE notification_jobs SET status = 'failed' WHERE id = $1 AND consumer_id = $2",
            [row.id, consumerId],
          );
          await tx.query(
            `INSERT INTO notification_log (consumer_id, alert_id, kind, channel, status, attempt, error)
             VALUES ($1, $2, 'alert', $3, 'failed', $4, $5)`,
            [consumerId, row.alert_id, row.channel, Math.max(row.attempts, 1), error],
          );
        };
        for (const row of due.rows) {
          if (row.enabled !== true || row.current_target === null)
            await finish(row, 'channel_disabled');
          else if (row.attempts >= maxAttempts) await finish(row, 'delivery_failed');
          else live.push(row);
        }

        if (live.length) {
          // Count the attempt now, and lease the job so other workers skip it until the lease lapses.
          await tx.query(
            `UPDATE notification_jobs
                SET attempts = attempts + 1,
                    next_attempt_at = now() + make_interval(secs => $3::double precision)
              WHERE consumer_id = $1 AND id = ANY($2::uuid[])`,
            [consumerId, live.map((x) => x.id), (shiftMs + leaseMs) / 1000],
          );
        }
        return live.map((x) => ({
          id: x.id,
          alertId: x.alert_id,
          userId: x.user_id,
          channel: x.channel,
          target: x.current_target as string,
          attempts: x.attempts + 1,
          severity: x.severity,
          title: x.title,
          description: x.description,
          recommendedAction: x.recommended_action,
        }));
      });
    },

    async releaseJobs(consumerId, jobs, shiftMs = 0) {
      if (jobs.length === 0) return;
      await withTenant(pool, consumerId, async (tx) => {
        // Only jobs still exactly as claimed (same attempt number, still pending) are released.
        await tx.query(
          `UPDATE notification_jobs j
              SET attempts = j.attempts - 1,
                  next_attempt_at = now() + make_interval(secs => $4::double precision)
             FROM unnest($2::uuid[], $3::int[]) AS t(id, attempts)
            WHERE j.consumer_id = $1 AND j.id = t.id AND j.attempts = t.attempts AND j.status = 'pending'`,
          [consumerId, jobs.map((j) => j.id), jobs.map((j) => j.attempts), shiftMs / 1000],
        );
      });
    },

    async recordAttempt(consumerId, job, result, plan, shiftMs = 0) {
      await withTenant(pool, consumerId, async (tx) => {
        const cur = await tx.query<{ attempts: number; status: string }>(
          'SELECT attempts, status FROM notification_jobs WHERE id = $1 AND consumer_id = $2 FOR UPDATE',
          [job.id, consumerId],
        );
        const row = cur.rows[0];
        // job.attempts is the number claimed for this try. Anything else means it was already handled.
        if (!row || row.status !== 'pending' || row.attempts !== job.attempts) return;
        await tx.query(
          `INSERT INTO notification_log (consumer_id, alert_id, kind, channel, status, attempt, error)
           VALUES ($1, $2, 'alert', $3, $4, $5, $6)`,
          [
            consumerId,
            job.alertId,
            job.channel,
            result.ok ? 'sent' : 'failed',
            job.attempts,
            result.ok ? null : result.error,
          ],
        );
        const retry = plan.status === 'retry';
        await tx.query(
          `UPDATE notification_jobs
              SET status = $3,
                  next_attempt_at = CASE WHEN $4::boolean THEN now() + make_interval(secs => $5::double precision) ELSE next_attempt_at END
            WHERE id = $1 AND consumer_id = $2`,
          [
            job.id,
            consumerId,
            retry ? 'pending' : plan.status,
            retry,
            (shiftMs + (plan.retryAfterMs ?? 0)) / 1000,
          ],
        );
      });
    },

    async recordTestSend({ consumerId, userId }, e) {
      await withTenant(pool, consumerId, async (tx) => {
        await tx.query(
          `INSERT INTO notification_log (consumer_id, alert_id, kind, channel, status, attempt, error)
           VALUES ($1, NULL, 'test', $2, $3, 1, $4)`,
          [consumerId, e.channel, e.status, e.error],
        );
        await tx.query(
          'INSERT INTO audit_events (consumer_id, user_id, action, object) VALUES ($1, $2, $3, $4)',
          [consumerId, userId, 'channel.test', `channel:${e.channel}`],
        );
      });
    },
  };
}
