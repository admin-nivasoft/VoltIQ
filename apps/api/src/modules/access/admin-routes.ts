import type { FastifyInstance } from 'fastify';
import { RolePolicyResponseSchema, RolePolicyUpdateSchema } from '@ql/contracts';
import type { AppStateRepository } from '../../data/index.ts';
import { parseInput, unauthenticated } from '../../errors.ts';
import { requirePermission, type PolicyService } from './policy.ts';

/**
 * The role policy (D-01). Only a platform_admin holds permissions.manage, and the contract refuses any
 * policy that gives it to another role. Every save is a new version with an audit event; the cache is
 * cleared so the change applies at once on this instance (others pick it up within 10 s).
 */
export function registerAdminRoutes(
  app: FastifyInstance,
  deps: { repo: AppStateRepository; policy: PolicyService },
): void {
  const { repo, policy } = deps;
  const guard = { preHandler: requirePermission(policy, 'permissions.manage') };

  app.get('/admin/permissions', guard, async () => {
    policy.invalidate(); // an admin reading the policy should see the latest, not a 10 s old copy
    return RolePolicyResponseSchema.parse({
      policy: await policy.current(),
      asOf: new Date().toISOString(),
    });
  });

  app.put('/admin/permissions', guard, async (req) => {
    if (!req.auth) throw unauthenticated();
    const { roles } = parseInput(RolePolicyUpdateSchema, req.body);
    // The author is the signed-in admin. The body cannot name a version, an author or a consumer.
    const version = await repo.publishPolicy(req.auth.userId, roles);
    policy.invalidate();
    return RolePolicyResponseSchema.parse({
      policy: { version, roles },
      asOf: new Date().toISOString(),
    });
  });
}
