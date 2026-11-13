import type { FastifyRequest } from 'fastify';
import type { Principal } from '../../data/index.ts';
import { forbidden, unauthenticated } from '../../errors.ts';

/**
 * The acting user and consumer, taken only from the verified session (never from the URL, query
 * or body). A signed-in user with no consumer (platform_admin) has no fleet to act on.
 */
export function principalOf(req: FastifyRequest): Principal {
  if (!req.auth) throw unauthenticated();
  if (!req.auth.consumerId) throw forbidden();
  return { consumerId: req.auth.consumerId, userId: req.auth.userId };
}
