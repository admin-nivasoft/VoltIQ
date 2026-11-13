import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.ts';
import type { AppStateRepository } from './data/index.ts';
import { registerErrorHandling } from './errors.ts';
import { createTokens, registerAuth } from './modules/access/auth.ts';
import { PolicyService } from './modules/access/policy.ts';
import { registerAccessRoutes } from './modules/access/routes.ts';

export interface AppDeps {
  config: Config;
  repo: AppStateRepository;
  logger?: boolean;
}

export async function buildApp({
  config,
  repo,
  logger = false,
}: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger,
    trustProxy: config.trustProxy,
    bodyLimit: 100 * 1024,
  });
  const tokens = createTokens(config.jwtSecret);
  const policy = new PolicyService(repo);

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
    },
    { prefix: '/api/v1' },
  );

  return app;
}
