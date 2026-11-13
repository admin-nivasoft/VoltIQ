import type { FastifyInstance } from 'fastify';
import {
  NotificationChannelSchema,
  NotificationChannelsPutSchema,
  NotificationLogPageSchema,
  NotificationTestRequestSchema,
  NotificationTestResultSchema,
  PageQuerySchema,
} from '@ql/contracts';
import { z } from 'zod';
import type { AppStateRepository } from '../../data/index.ts';
import { notFound, parseInput } from '../../errors.ts';
import { requirePermission, type PolicyService } from '../access/policy.ts';
import { principalOf } from '../access/principal.ts';
import { sanitizeError, type ProviderRegistry } from './providers.ts';

export function registerNotificationRoutes(
  app: FastifyInstance,
  deps: { repo: AppStateRepository; policy: PolicyService; providers: ProviderRegistry },
): void {
  const { repo, policy, providers } = deps;
  const own = { preHandler: requirePermission(policy, 'channels.manage_own') };

  // The user is always the signed-in user (from the session). No route takes a user id.
  app.get('/notification-channels', own, async (req) => {
    return z.array(NotificationChannelSchema).parse(await repo.listChannels(principalOf(req)));
  });

  app.put('/notification-channels', own, async (req) => {
    const { channels } = parseInput(NotificationChannelsPutSchema, req.body);
    return z
      .array(NotificationChannelSchema)
      .parse(await repo.saveChannels(principalOf(req), channels));
  });

  // Sending to a user-chosen target is abusable (spam, SMS pumping once a real provider exists): limit it hard.
  app.post(
    '/notification-channels/test',
    { ...own, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req) => {
      const principal = principalOf(req);
      const { type } = parseInput(NotificationTestRequestSchema, req.body);
      const channel = (await repo.listChannels(principal)).find((c) => c.type === type);
      if (!channel) throw notFound();

      let ok = false;
      let error: string | null;
      try {
        const r = await providers[type].send({
          target: channel.target,
          kind: 'test',
          subject: '82V QualityLoop test message',
          body: 'This is a test message from 82V QualityLoop. No action is needed.',
        });
        ok = r.ok;
        error = r.ok ? null : sanitizeError(r.error);
      } catch (err) {
        error = sanitizeError(err);
      }
      await repo.recordTestSend(principal, {
        channel: type,
        status: ok ? 'sent' : 'failed',
        error,
      });
      return NotificationTestResultSchema.parse({
        channel: type,
        status: ok ? 'sent' : 'failed',
        error,
        at: new Date().toISOString(),
      });
    },
  );

  app.get(
    '/notification-log',
    { preHandler: requirePermission(policy, 'notifications.view_log') },
    async (req) => {
      const { consumerId } = principalOf(req);
      const q = parseInput(PageQuerySchema, req.query);
      return NotificationLogPageSchema.parse(await repo.listNotificationLog(consumerId, q));
    },
  );
}
