import type { FastifyInstance } from 'fastify';
import { MeSchema } from '@ql/contracts';
import { z } from 'zod';
import type { Config } from '../../config.ts';
import type { AppStateRepository } from '../../data/index.ts';
import { parseInput, unauthenticated } from '../../errors.ts';
import { clearSessionCookie, requireAuth, setSessionCookie, type Tokens } from './auth.ts';
import type { PolicyService } from './policy.ts';

const MockLoginBody = z.object({ userId: z.string().uuid() }).strict();

export function registerAccessRoutes(
  app: FastifyInstance,
  deps: { config: Config; repo: AppStateRepository; policy: PolicyService; tokens: Tokens },
): void {
  const { config, repo, policy, tokens } = deps;

  // Mock login exists only when AUTH_PROVIDER=mock AND ENABLE_DEV_ENDPOINTS=true (D-08).
  // Otherwise the route is never registered, so it answers 404 like any unknown path.
  if (config.mockEnabled) {
    app.post(
      '/auth/mock-login',
      { config: { rateLimit: { max: config.rateLimitLoginPerMinute, timeWindow: '1 minute' } } },
      async (req, reply) => {
        const { userId } = parseInput(MockLoginBody, req.body);
        const user = await repo.findUser(userId);
        if (!user) throw unauthenticated();
        if (user.consumerId) await repo.recordAudit(user.consumerId, user.id, 'login', 'session');
        else await repo.recordPlatformAudit(user.id, 'login', 'session');
        setSessionCookie(req, reply, await tokens.sign(user), config.nodeEnv);
        return reply.send({ ok: true });
      },
    );
  }

  app.post('/auth/logout', async (req, reply) => {
    clearSessionCookie(req, reply, config.nodeEnv);
    return reply.status(204).send();
  });

  app.get('/me', async (req) => {
    const a = requireAuth(req);
    const me = a.consumerId
      ? await repo.getMe(a.consumerId, a.userId)
      : await repo.getPlatformMe(a.userId);
    if (!me) throw unauthenticated();
    return MeSchema.parse({
      ...me,
      permissions: await policy.permissionsFor(a.role),
      asOf: new Date().toISOString(),
    });
  });
}
