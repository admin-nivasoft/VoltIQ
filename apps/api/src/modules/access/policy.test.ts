import { describe, expect, it, vi } from 'vitest';
import type { RolePolicy } from '@ql/contracts';
import policyFile from '../../../../../config/permissions.json';
import { PolicyService } from './policy.ts';

const v1 = policyFile as RolePolicy;

const repoWith = (policies: unknown[]) => {
  let i = 0;
  const getLatestPolicy = vi.fn(
    async () => policies[Math.min(i++, policies.length - 1)] as RolePolicy,
  );
  return { getLatestPolicy };
};

describe('PolicyService (D-01)', () => {
  it('returns the permissions of each role from the stored policy', async () => {
    const svc = new PolicyService(repoWith([v1]));
    expect(await svc.permissionsFor('technician')).not.toContain('alerts.acknowledge');
    expect(await svc.permissionsFor('fleet_manager')).toContain('alerts.acknowledge');
    expect(await svc.permissionsFor('consumer_admin')).not.toContain('permissions.manage');
    expect(await svc.permissionsFor('platform_admin')).toEqual(['permissions.manage']);
  });

  it('caches for 10 seconds, then reloads', async () => {
    let now = 0;
    const repo = repoWith([v1, { ...v1, version: 2 }]);
    const svc = new PolicyService(repo, 10_000, () => now);
    await svc.permissionsFor('technician');
    now = 9_999;
    await svc.permissionsFor('technician');
    expect(repo.getLatestPolicy).toHaveBeenCalledTimes(1);
    now = 10_001;
    await svc.permissionsFor('technician');
    expect(repo.getLatestPolicy).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the stored policy is invalid or the load fails', async () => {
    const bad = { version: 1, roles: { ...v1.roles, technician: ['permissions.manage'] } };
    await expect(new PolicyService(repoWith([bad])).permissionsFor('technician')).rejects.toThrow();
    const broken = {
      getLatestPolicy: async () => {
        throw new Error('db down');
      },
    };
    await expect(new PolicyService(broken).permissionsFor('technician')).rejects.toThrow();
  });

  it('has() answers permission checks', async () => {
    const svc = new PolicyService(repoWith([v1]));
    expect(await svc.has('fleet_manager', 'alerts.acknowledge')).toBe(true);
    expect(await svc.has('technician', 'alerts.acknowledge')).toBe(false);
  });
});
