import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createDataLayer, createPool } from './data/index.ts';
import { createProviderRegistry } from './modules/notifications/providers.ts';
import { NotificationWorker } from './modules/notifications/worker.ts';

const config = loadConfig(process.env);
const pool = createPool(config.databaseUrl);
const { fleet, state } = createDataLayer(config, pool);
const providers = createProviderRegistry(config.notify);
const app = await buildApp({ config, repo: state, fleet, providers, logger: true });
// The outbox worker runs in the API process (D-07); several workers are safe (SKIP LOCKED).
const worker = new NotificationWorker({
  repo: state,
  providers,
  onError: (err) => app.log.error({ err }, 'notification worker'),
});
worker.start();

let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    if (stopping) return;
    stopping = true;
    void worker
      .stop()
      .then(() => app.close())
      .then(() => pool.end())
      .then(() => process.exit(0));
  });
}
await app.listen({ host: '0.0.0.0', port: config.port });
