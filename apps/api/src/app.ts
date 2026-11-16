import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.ts';
import { buildOpenApiDocument } from '@ql/contracts/openapi';
import type { AppStateRepository, FleetDataSource } from './data/index.ts';
import { registerErrorHandling } from './errors.ts';
import { createTokens, registerAuth } from './modules/access/auth.ts';
import { PolicyService } from './modules/access/policy.ts';
import { registerAccessRoutes } from './modules/access/routes.ts';
import { registerAdminRoutes } from './modules/access/admin-routes.ts';
import { registerAlertRoutes } from './modules/alerts/routes.ts';
import { registerFleetRoutes } from './modules/fleet/routes.ts';
import { registerDevRoutes } from './modules/notifications/dev-routes.ts';
import {
  createProviderRegistry,
  type ProviderRegistry,
} from './modules/notifications/providers.ts';
import { registerNotificationRoutes } from './modules/notifications/routes.ts';

declare module 'fastify' {
  interface FastifyInstance {
    /** Every registered route and whether it has a preHandler guard. Read by tests, never by code paths. */
    routeInventory: { method: string; url: string; guarded: boolean }[];
  }
}

export interface AppDeps {
  config: Config;
  repo: AppStateRepository;
  fleet: FleetDataSource;
  /** Defaults to the providers named in config. */
  providers?: ProviderRegistry;
  logger?: boolean;
}

export async function buildApp({
  config,
  repo,
  fleet,
  providers = createProviderRegistry(config.notify),
  logger = false,
}: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger,
    trustProxy: config.trustProxy,
    bodyLimit: 100 * 1024,
  });
  const tokens = createTokens(config.jwtSecret);
  const policy = new PolicyService(repo);

  const routeInventory: FastifyInstance['routeInventory'] = [];
  app.decorate('routeInventory', routeInventory);
  app.addHook('onRoute', (r) => {
    for (const method of [r.method].flat())
      routeInventory.push({ method, url: r.url, guarded: Boolean(r.preHandler) });
  });

  registerErrorHandling(app);
  await app.register(helmet);
  await app.register(cookie);
  registerAuth(app, config, repo, tokens);
  await app.register(rateLimit, {
    global: true,
    max: config.rateLimitPerMinute,
    timeWindow: '1 minute',
    // Per user once signed in, per address before that (D-14).
    keyGenerator: (req) => req.auth?.userId ?? req.ip,
    errorResponseBuilder: () => Object.assign(new Error('Too many requests'), { statusCode: 429 }),
  });

  app.get('/healthz', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));
  app.get('/readyz', { config: { rateLimit: false } }, async (_req, reply) => {
    try {
      await repo.ping();
      return { status: 'ready' };
    } catch {
      return reply.status(503).send({ status: 'unavailable' });
    }
  });

  await app.register(
    async (api) => {
      registerAccessRoutes(api, { config, repo, policy, tokens });
      registerAdminRoutes(api, { repo, policy });
      registerFleetRoutes(api, { fleet, policy });
      registerAlertRoutes(api, { fleet, repo, policy });
      registerNotificationRoutes(api, { repo, policy, providers });
      if (config.mockEnabled) registerDevRoutes(api, { repo, policy });
      // The API description lists no consumer data and no mock endpoints, so it is public.
      const openapi = buildOpenApiDocument();
      api.get('/openapi.json', async () => openapi);
    },
    { prefix: '/api/v1' },
  );

  return app;
}
