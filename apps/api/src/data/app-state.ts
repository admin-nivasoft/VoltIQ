import type { Role } from '@ql/contracts';
import type { Pool } from './pool.ts';
import { withTenant } from './tenant.ts';
import type { AppStateRepository, UserRef } from './types.ts';

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
            WHERE u.id = $1`,
          [userId],
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

    async ping() {
      await pool.query('SELECT 1');
    },
  };
}
