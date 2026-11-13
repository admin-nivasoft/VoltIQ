// Database provisioning for local dev and tests: bootstrap roles, run migrations, seed.
// Lives under src/data so it may import pg and node-pg-migrate (CLAUDE.md non-negotiable 5).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runner } from 'node-pg-migrate';
import pg from 'pg';

const repoRoot = resolve(import.meta.dirname, '../../../..');
export const dbPaths = {
  bootstrap: resolve(repoRoot, 'db/bootstrap.sql'),
  migrations: resolve(repoRoot, 'db/migrations'),
  seed: resolve(repoRoot, 'db/seed/seed.sql'),
};

export const DEV_PASSWORDS = { ql_owner: 'ql_owner_dev', ql_app: 'ql_app_dev' } as const;

/** Derive a role's connection URL from the superuser URL (same host, port and database). */
export function roleUrl(superUrl: string, role: keyof typeof DEV_PASSWORDS): string {
  const u = new URL(superUrl);
  u.username = role;
  u.password = DEV_PASSWORDS[role];
  return u.toString();
}

async function runSql(url: string, file: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(readFileSync(file, 'utf8'));
  } finally {
    await client.end();
  }
}

/** Drop and rebuild the schema: bootstrap (superuser), migrate and seed (ql_owner). Idempotent. */
export async function resetDatabase(
  superUrl: string,
  opts: { allowAnyHost?: boolean } = {},
): Promise<void> {
  // Refuse to drop a schema anywhere but a local dev database (or a test container).
  const host = new URL(superUrl).hostname;
  if (process.env.NODE_ENV === 'production')
    throw new Error('Refusing to reset a database with NODE_ENV=production');
  if (!opts.allowAnyHost && !['localhost', '127.0.0.1', '[::1]', '::1'].includes(host)) {
    throw new Error(`Refusing to reset a non-local database (${host})`);
  }
  await runSql(superUrl, dbPaths.bootstrap);
  const ownerUrl = roleUrl(superUrl, 'ql_owner');
  await runner({
    databaseUrl: ownerUrl,
    dir: dbPaths.migrations,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    count: Infinity,
    log: () => {},
  });
  await runSql(ownerUrl, dbPaths.seed);
}
