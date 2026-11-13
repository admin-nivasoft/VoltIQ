import {
  NotificationChannelSchema,
  NotificationLogEntrySchema,
  type NotificationChannel,
  type NotificationLogEntry,
  type Page,
  type Role,
} from '@ql/contracts';
import { selectAlert, UUID_RE } from './alert-sql.ts';
import { createOutboxMethods } from './outbox.ts';
import type { Pool } from './pool.ts';
import { withTenant, type Tx } from './tenant.ts';
import { PageQuerySchema } from '@ql/contracts';
import { parseSort, QueryError } from './query.ts';
import type { AcknowledgeResult, AppStateRepository, UserRef } from './types.ts';

interface UserRow extends Record<string, unknown> {
  id: string;
  consumer_id: string | null;
  role: Role;
  name: string;
}

const toUser = (r: UserRow): UserRef => ({
  id: r.id,
  consumerId: r.consumer_id,
  role: r.role,
  name: r.name,
});

async function selectChannels(
  tx: Tx,
  consumerId: string,
  userId: string,
): Promise<NotificationChannel[]> {
  const r = await tx.query<{
    id: string;
    type: NotificationChannel['type'];
    target: string;
    enabled: boolean;
  }>(
    'SELECT id, type, target, enabled FROM notification_channels WHERE consumer_id = $1 AND user_id = $2 ORDER BY type',
    [consumerId, userId],
  );
  return r.rows.map((c) =>
    NotificationChannelSchema.parse({
      id: c.id,
      type: c.type,
      target: c.target,
      enabled: c.enabled,
    }),
  );
}

export function createAppStateRepository(pool: Pool): AppStateRepository {
  return {
    async findUser(userId) {
      const r = await pool.query<UserRow>('SELECT * FROM auth_find_user($1)', [userId]);
      return r.rows[0] ? toUser(r.rows[0]) : null;
    },

    async listConsumerIds() {
      const r = await pool.query<{ id: string }>('SELECT id FROM list_consumer_ids()');
      return r.rows.map((x) => x.id);
    },

    async getMe(consumerId, userId) {
      return withTenant(pool, consumerId, async (tx) => {
        const r = await tx.query<{
          user_id: string;
          user_name: string;
          role: Role;
          consumer_id: string;
          consumer_name: string;
          consumer_type: 'oem' | 'ess_integrator' | 'fleet_operator';
          manufacturer_name: string;
          logo_url: string | null;
        }>(
          `SELECT u.id AS user_id, u.name AS user_name, u.role,
                  c.id AS consumer_id, c.name AS consumer_name, c.type AS consumer_type,
                  m.name AS manufacturer_name, m.logo_url
             FROM users u
             JOIN consumers c ON c.id = u.consumer_id
             JOIN manufacturers m ON m.id = c.manufacturer_id
            WHERE u.id = $1 AND u.consumer_id = $2`,
          [userId, consumerId],
        );
        const row = r.rows[0];
        if (!row) return null;
        return {
          user: { id: row.user_id, name: row.user_name, role: row.role },
          consumer: { id: row.consumer_id, name: row.consumer_name, type: row.consumer_type },
          manufacturer: { name: row.manufacturer_name, logoUrl: row.logo_url },
        };
      });
    },

    async getPlatformMe(userId) {
      const u = await this.findUser(userId);
      if (!u || u.consumerId !== null) return null;
      return { user: { id: u.id, name: u.name, role: u.role }, consumer: null, manufacturer: null };
    },

    async getLatestPolicy() {
      const r = await pool.query<{ version: number; policy: { roles: Record<string, string[]> } }>(
        'SELECT version, policy FROM role_policies ORDER BY version DESC LIMIT 1',
      );
      const row = r.rows[0];
      if (!row) throw new Error('No role policy found');
      return { ...row.policy, version: row.version };
    },

    async recordAudit(consumerId, userId, action, object) {
      await withTenant(pool, consumerId, async (tx) => {
        await tx.query(
          'INSERT INTO audit_events (consumer_id, user_id, action, object) VALUES ($1, $2, $3, $4)',
          [consumerId, userId, action, object],
        );
      });
    },

    async recordPlatformAudit(userId, action, object) {
      await pool.query('SELECT audit_platform_event($1, $2, $3)', [userId, action, object]);
    },

    async acknowledgeAlert({ consumerId, userId }, alertId): Promise<AcknowledgeResult> {
      if (!UUID_RE.test(alertId)) return { kind: 'not_found' };
      return withTenant(pool, consumerId, async (tx) => {
        // Lock the row so two simultaneous acknowledgements cannot both write.
        const cur = await tx.query<{ status: string }>(
          'SELECT status FROM alerts WHERE id = $1 AND consumer_id = $2 FOR UPDATE',
          [alertId, consumerId],
        );
        const status = cur.rows[0]?.status;
        if (status === undefined) return { kind: 'not_found' };
        if (status === 'resolved') return { kind: 'resolved' };
        if (status === 'acknowledged') {
          const alert = await selectAlert(tx, consumerId, alertId);
          return alert ? { kind: 'already_acknowledged', alert } : { kind: 'not_found' };
        }
        await tx.query(
          "UPDATE alerts SET status = 'acknowledged', acknowledged_by = $3, acknowledged_at = now() WHERE id = $1 AND consumer_id = $2",
          [alertId, consumerId, userId],
        );
        await tx.query(
          'INSERT INTO audit_events (consumer_id, user_id, action, object) VALUES ($1, $2, $3, $4)',
          [consumerId, userId, 'alert.acknowledge', `alert:${alertId}`],
        );
        const alert = await selectAlert(tx, consumerId, alertId);
        return alert ? { kind: 'acknowledged', alert } : { kind: 'not_found' };
      });
    },

    async listChannels({ consumerId, userId }) {
      return withTenant(pool, consumerId, (tx) => selectChannels(tx, consumerId, userId));
    },

    async saveChannels({ consumerId, userId }, channels) {
      return withTenant(pool, consumerId, async (tx) => {
        const types = channels.map((c) => c.type);
        await tx.query(
          'DELETE FROM notification_channels WHERE consumer_id = $1 AND user_id = $2 AND NOT (type = ANY($3::text[]))',
          [consumerId, userId, types],
        );
        for (const c of channels) {
          await tx.query(
            `INSERT INTO notification_channels (user_id, consumer_id, type, target, enabled) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (consumer_id, user_id, type) DO UPDATE SET target = EXCLUDED.target, enabled = EXCLUDED.enabled`,
            [userId, consumerId, c.type, c.target, c.enabled],
          );
        }
        await tx.query(
          'INSERT INTO audit_events (consumer_id, user_id, action, object) VALUES ($1, $2, $3, $4)',
          [consumerId, userId, 'channels.update', `user:${userId}`],
        );
        return selectChannels(tx, consumerId, userId);
      });
    },

    async listNotificationLog(consumerId, q): Promise<Page<NotificationLogEntry>> {
      const parsed = PageQuerySchema.safeParse(q);
      if (!parsed.success) throw new QueryError('Invalid page');
      const { page, pageSize } = parsed.data;
      // Only `at` (newest first) is offered; any other sort key is a 400.
      parseSort(q.sort, ['at'] as const, { field: 'at', dir: 'desc' });
      return withTenant(pool, consumerId, async (tx) => {
        const total = Number(
          (
            await tx.query<{ n: string }>(
              'SELECT count(*) AS n FROM notification_log WHERE consumer_id = $1',
              [consumerId],
            )
          ).rows[0]?.n ?? 0,
        );
        const rows = await tx.query<{
          id: string;
          alert_id: string | null;
          kind: 'alert' | 'test';
          channel: NotificationChannel['type'];
          status: 'sent' | 'failed';
          attempt: number;
          error: string | null;
          at: Date;
        }>(
          `SELECT id, alert_id, kind, channel, status, attempt, error, at FROM notification_log
            WHERE consumer_id = $1 ORDER BY at DESC, id ASC LIMIT $2 OFFSET $3`,
          [consumerId, pageSize, (page - 1) * pageSize],
        );
        return {
          items: rows.rows.map((r) =>
            NotificationLogEntrySchema.parse({
              id: r.id,
              alertId: r.alert_id,
              kind: r.kind,
              channel: r.channel,
              status: r.status,
              attempt: r.attempt,
              error: r.error,
              at: r.at.toISOString(),
            }),
          ),
          total,
          page,
          pageSize,
          asOf: new Date().toISOString(),
        };
      });
    },

    async appendNotificationLog(consumerId, e) {
      await withTenant(pool, consumerId, async (tx) => {
        await tx.query(
          'INSERT INTO notification_log (consumer_id, alert_id, kind, channel, status, attempt, error) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [consumerId, e.alertId, e.kind, e.channel, e.status, e.attempt, e.error],
        );
      });
    },

    ...createOutboxMethods(pool),

    async ping() {
      await pool.query('SELECT 1');
    },
  };
}
