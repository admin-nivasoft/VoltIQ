// The data layer's public surface. Code outside src/data imports from here, never from pg.
export { createPool, type Pool } from './pool.ts';
export { withTenant, type Tx } from './tenant.ts';
export { createAppStateRepository } from './app-state.ts';
export type { AppStateRepository, UserRef } from './types.ts';
