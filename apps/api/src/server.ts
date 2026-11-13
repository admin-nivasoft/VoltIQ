import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createAppStateRepository, createPool } from './data/index.ts';

const config = loadConfig(process.env);
const pool = createPool(config.databaseUrl);
const app = await buildApp({ config, repo: createAppStateRepository(pool), logger: true });

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    void app
      .close()
      .then(() => pool.end())
      .then(() => process.exit(0));
  });
}
await app.listen({ host: '0.0.0.0', port: config.port });
