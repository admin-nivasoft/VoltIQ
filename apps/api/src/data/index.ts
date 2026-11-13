// The data layer's public surface. Code outside src/data imports from here, never from pg.
import type { Config } from '../config.ts';
import { createPostgresMockSource } from './adapters/postgres-mock.ts';
import { createAppStateRepository } from './app-state.ts';
import type { FleetDataSource } from './fleet-source.ts';
import type { Pool } from './pool.ts';
import type { AppStateRepository } from './types.ts';

export { createPool, type Pool } from './pool.ts';
export { withTenant, type Tx } from './tenant.ts';
export { createAppStateRepository } from './app-state.ts';
export { createPostgresMockSource } from './adapters/postgres-mock.ts';
export { QueryError } from './query.ts';
export type { FleetDataSource, PackQuery, AlertQuery } from './fleet-source.ts';
export type {
  AppStateRepository,
  UserRef,
  AcknowledgeResult,
  NewLogEntry,
  Principal,
  ClaimedJob,
  NewAlert,
  AttemptPlan,
  ClaimOptions,
} from './types.ts';

/** Registry keyed by DATA_PROVIDER. An unknown value already failed config loading. */
export function createFleetDataSource(config: Config, pool: Pool): FleetDataSource {
  switch (config.dataProvider) {
    case 'postgres-mock':
      return createPostgresMockSource(pool, config);
  }
}

export function createDataLayer(
  config: Config,
  pool: Pool,
): { fleet: FleetDataSource; state: AppStateRepository } {
  return { fleet: createFleetDataSource(config, pool), state: createAppStateRepository(pool) };
}
