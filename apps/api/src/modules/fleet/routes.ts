import type { FastifyInstance } from 'fastify';
import {
  FleetSummarySchema,
  PackPageSchema,
  PackQuerySchema,
  PageQuerySchema,
} from '@ql/contracts';
import type { FleetDataSource } from '../../data/index.ts';
import { parseInput } from '../../errors.ts';
import { principalOf } from '../access/principal.ts';
import { requirePermission, type PolicyService } from '../access/policy.ts';

const PackListQuery = PageQuerySchema.merge(PackQuerySchema);

export function registerFleetRoutes(
  app: FastifyInstance,
  deps: { fleet: FleetDataSource; policy: PolicyService },
): void {
  const { fleet, policy } = deps;

  app.get(
    '/fleet/summary',
    { preHandler: requirePermission(policy, 'fleet.view') },
    async (req) => {
      const { consumerId } = principalOf(req);
      return FleetSummarySchema.parse(await fleet.getFleetSummary(consumerId));
    },
  );

  app.get('/packs', { preHandler: requirePermission(policy, 'packs.view') }, async (req) => {
    const { consumerId } = principalOf(req);
    const q = parseInput(PackListQuery, req.query);
    return PackPageSchema.parse(await fleet.listPacks(consumerId, q));
  });
}
