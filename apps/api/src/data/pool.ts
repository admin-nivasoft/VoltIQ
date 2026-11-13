import pg from 'pg';

/** The application pool. It must connect as ql_app: owns nothing, no BYPASSRLS (D-02). */
export function createPool(connectionString: string, max = 10): pg.Pool {
  const pool = new pg.Pool({ connectionString, max });
  // An idle-client error must not crash the process.
  pool.on('error', () => {});
  return pool;
}

export type Pool = pg.Pool;
