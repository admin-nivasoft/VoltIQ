import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/** Every run starts from the same seeded database, because some tests acknowledge alerts. */
export default function globalSetup(): void {
  try {
    execSync('pnpm db:reset', { cwd: resolve(import.meta.dirname, '../../..'), stdio: 'pipe' });
  } catch (err) {
    const out = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not reset the database. Is it running? Start it with "docker compose up -d db --wait".\n${out.slice(0, 400)}`,
    );
  }
}
