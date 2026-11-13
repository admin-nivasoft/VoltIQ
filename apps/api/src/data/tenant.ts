import type pg from 'pg';

/** What a function inside withTenant may do. Deliberately narrower than pg.PoolClient. */
export interface Tx {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs fn in one transaction with the tenant set via set_config(..., true), which is
 * transaction-local and cannot leak to the next user of a pooled connection (D-02).
 * Never replace this with a plain SET.
 */
export async function withTenant<T>(
  pool: pg.Pool,
  consumerId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!UUID.test(consumerId)) throw new Error('withTenant: consumerId must be a UUID');
  const client = await pool.connect();
  let destroy: Error | undefined;
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.consumer_id', $1, true)", [consumerId]);
    const result = await fn(client as unknown as Tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      // Never return a connection that may still hold an open tenant transaction to the pool.
      destroy = rollbackErr instanceof Error ? rollbackErr : new Error('rollback failed');
    }
    throw err;
  } finally {
    client.release(destroy);
  }
}
