import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { resetDatabase, roleUrl } from '../provision.ts';

export interface TestDb {
  superUrl: string;
  ownerUrl: string;
  appUrl: string;
  stop: () => Promise<void>;
}

/** Starts a throwaway Postgres 16, then bootstraps, migrates and seeds it. */
export async function startTestDb(): Promise<TestDb> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:16',
  ).start();
  const superUrl = container.getConnectionUri();
  await resetDatabase(superUrl, { allowAnyHost: true });
  return {
    superUrl,
    ownerUrl: roleUrl(superUrl, 'ql_owner'),
    appUrl: roleUrl(superUrl, 'ql_app'),
    stop: async () => {
      await container.stop();
    },
  };
}

export function newPool(url: string, max = 1): pg.Pool {
  return new pg.Pool({ connectionString: url, max });
}

export const CONSUMERS = {
  A: 'a0000000-0000-4000-8000-000000000001',
  B: 'b0000000-0000-4000-8000-000000000002',
  C: 'c0000000-0000-4000-8000-000000000003',
} as const;

export const TENANT_TABLES = [
  'consumers',
  'users',
  'packs',
  'pack_health',
  'alerts',
  'notification_channels',
  'notification_jobs',
  'notification_log',
  'audit_events',
] as const;

/** Mirrors the future withTenant: transaction-local set_config, never a plain SET (D-02). */
export async function withTenantRaw<T>(
  pool: pg.Pool,
  consumerId: string,
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT set_config('app.consumer_id', $1, true)", [consumerId]);
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
