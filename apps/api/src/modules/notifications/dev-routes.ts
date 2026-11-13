import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  SimulateAlertRequestSchema,
  SimulateAlertResultSchema,
  type Severity,
} from '@ql/contracts';
import type { AppStateRepository } from '../../data/index.ts';
import { conflict, forbidden, notFound, parseInput, unauthenticated } from '../../errors.ts';
import type { PolicyService } from '../access/policy.ts';

const TEMPLATES: Record<
  Severity,
  { title: string; description: string; recommendedAction: string }
> = {
  high: {
    title: 'Battery health is dropping faster than expected',
    description:
      'This pack has lost capacity quickly over the last few days and may not last its planned service life.',
    recommendedAction: 'Arrange an inspection within 7 days and plan a replacement.',
  },
  medium: {
    title: 'Battery is ageing faster than similar packs',
    description:
      'This pack is losing capacity a little faster than expected. It is still within normal limits.',
    recommendedAction: 'Review how this pack is used and recheck in 30 days.',
  },
  low: {
    title: 'Small change in battery behaviour',
    description:
      'We noticed a small change in how this pack charges. No action is needed right now.',
    recommendedAction: 'No action needed. Keep monitoring.',
  },
};

/**
 * Registered only when AUTH_PROVIDER=mock AND ENABLE_DEV_ENDPOINTS=true (D-08); otherwise the route
 * does not exist. It is the one documented exception to "consumer comes from the token" (D-04): it
 * takes consumerId in the body, and only a platform_admin token may use it.
 */
export function registerDevRoutes(
  app: FastifyInstance,
  deps: { repo: AppStateRepository; policy: PolicyService },
): void {
  const { repo, policy } = deps;

  // Only a platform_admin token may use it. Checked in a preHandler so the route inventory sees a guard.
  const platformAdminOnly = async (req: FastifyRequest): Promise<void> => {
    if (!req.auth) throw unauthenticated();
    if (req.auth.role !== 'platform_admin') throw forbidden();
  };

  app.post('/dev/simulate-alert', { preHandler: platformAdminOnly }, async (req) => {
    if (!req.auth) throw unauthenticated();
    const { consumerId, severity } = parseInput(SimulateAlertRequestSchema, req.body);
    if (!(await repo.listConsumerIds()).includes(consumerId)) throw notFound();

    // Audit first, so the action can never happen unrecorded (D-13).
    await repo.recordPlatformAudit(req.auth.userId, 'dev.simulate-alert', `consumer:${consumerId}`);
    const created = await repo.createAlertWithJobs(
      consumerId,
      { severity, ...TEMPLATES[severity], modelVersion: 'ql-health-1.3.0', confidence: 0.82 },
      await policy.rolesWith('alerts.view'),
    );
    if (!created) throw conflict('This consumer has no in-service pack');
    return SimulateAlertResultSchema.parse(created);
  });
}
