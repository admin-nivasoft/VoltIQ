import type { FastifyInstance } from 'fastify';
import { AlertPageSchema, AlertQuerySchema, AlertSchema, PageQuerySchema } from '@ql/contracts';
import { z } from 'zod';
import type { AppStateRepository, FleetDataSource } from '../../data/index.ts';
import { conflict, notFound, parseInput } from '../../errors.ts';
import { requirePermission, type PolicyService } from '../access/policy.ts';
import { principalOf } from '../access/principal.ts';

const AlertListQuery = PageQuerySchema.merge(AlertQuerySchema);
const IdParams = z.object({ id: z.string().uuid() });

export function registerAlertRoutes(
  app: FastifyInstance,
  deps: { fleet: FleetDataSource; repo: AppStateRepository; policy: PolicyService },
): void {
  const { fleet, repo, policy } = deps;

  app.get('/alerts', { preHandler: requirePermission(policy, 'alerts.view') }, async (req) => {
    const { consumerId } = principalOf(req);
    const q = parseInput(AlertListQuery, req.query);
    return AlertPageSchema.parse(await fleet.listAlerts(consumerId, q));
  });

  app.post(
    '/alerts/:id/acknowledge',
    { preHandler: requirePermission(policy, 'alerts.acknowledge') },
    async (req) => {
      const principal = principalOf(req);
      const { id } = parseInput(IdParams, req.params);
      const result = await repo.acknowledgeAlert(principal, id);
      switch (result.kind) {
        case 'acknowledged':
        case 'already_acknowledged':
          return AlertSchema.parse(result.alert);
        case 'resolved':
          throw conflict('This alert is already resolved');
        case 'not_found':
          // Missing and another consumer's alert are indistinguishable (CLAUDE.md rule 7).
          throw notFound();
      }
    },
  );
}
