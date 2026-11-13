import { resetDatabase } from '../provision.ts';

const superUrl =
  process.env.ADMIN_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5442/qualityloop';
await resetDatabase(superUrl);
console.log('Database reset: bootstrapped, migrated and seeded.');
