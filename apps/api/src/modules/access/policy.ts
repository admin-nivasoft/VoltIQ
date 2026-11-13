import type { FastifyRequest } from 'fastify';
import { RolePolicySchema, type Permission, type Role, type RolePolicy } from '@ql/contracts';
import { forbidden, unauthenticated } from '../../errors.ts';

/**
 * Role policy from the role_policies table, cached for 10 s (D-01). The stored policy is
 * validated on every load; an invalid or unreadable policy fails closed rather than falling
 * back to an older or default one.
 */
export class PolicyService {
  private cached: { policy: RolePolicy; at: number } | null = null;

  constructor(
    private readonly repo: { getLatestPolicy(): Promise<unknown> },
    private readonly ttlMs = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  async current(): Promise<RolePolicy> {
    const t = this.now();
    if (this.cached && t - this.cached.at < this.ttlMs) return this.cached.policy;
    const policy = RolePolicySchema.parse(await this.repo.getLatestPolicy());
    this.cached = { policy, at: t };
    return policy;
  }

  async permissionsFor(role: Role): Promise<Permission[]> {
    return [...(await this.current()).roles[role]];
  }

  async has(role: Role, permission: Permission): Promise<boolean> {
    return (await this.permissionsFor(role)).includes(permission);
  }

  invalidate(): void {
    this.cached = null;
  }
}

/** Route guard: 401 when signed out, 403 when the role lacks the permission. */
export function requirePermission(policy: PolicyService, permission: Permission) {
  return async (req: FastifyRequest): Promise<void> => {
    if (!req.auth) throw unauthenticated();
    if (!(await policy.has(req.auth.role, permission))) throw forbidden();
  };
}
