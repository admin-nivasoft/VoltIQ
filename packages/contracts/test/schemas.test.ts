import { describe, expect, it } from 'vitest';
import {
  ErrorSchema,
  MeSchema,
  NotificationChannelInputSchema,
  RolePolicyUpdateSchema,
  PageQuerySchema,
  RolePolicySchema,
  pageOf,
  AlertSchema,
  AlertSignalsSchema,
} from '../src/index.ts';
import policy from '../../../config/permissions.json';

describe('contracts', () => {
  it('config/permissions.json satisfies RolePolicySchema and platform_admin only manages permissions (D-01)', () => {
    const parsed = RolePolicySchema.parse(policy);
    expect(parsed.roles.platform_admin).toEqual(['permissions.manage']);
    expect(parsed.roles.consumer_admin).not.toContain('permissions.manage');
  });

  it('page query defaults and caps', () => {
    expect(PageQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 25 });
    expect(PageQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });

  it('channel targets are validated by type (D-07)', () => {
    const ok = (type: string, target: string) =>
      NotificationChannelInputSchema.safeParse({ type, target, enabled: true }).success;
    expect(ok('email', 'a@b.co')).toBe(true);
    expect(ok('email', 'nope')).toBe(false);
    expect(ok('sms', '+919876543210')).toBe(true);
    expect(ok('sms', '9876543210')).toBe(false);
    expect(ok('webhook', 'https://example.com/hook')).toBe(true);
    expect(ok('webhook', 'http://example.com/hook')).toBe(false);
  });

  it('error envelope shape', () => {
    expect(ErrorSchema.safeParse({ error: { code: 'not_found', message: 'x' } }).success).toBe(
      true,
    );
    expect(ErrorSchema.safeParse({ message: 'x' }).success).toBe(false);
  });

  it('schemas strip unknown fields so a spread database row cannot leak', () => {
    const row = {
      user: { id: crypto.randomUUID(), name: 'A', role: 'technician', password_hash: 'x' },
      consumer: null,
      manufacturer: null,
      permissions: [],
      asOf: new Date().toISOString(),
    };
    expect(JSON.stringify(MeSchema.parse(row))).not.toContain('password_hash');
  });

  it('pageOf wraps items with total and asOf', () => {
    const r = pageOf(AlertSchema).safeParse({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
      asOf: new Date().toISOString(),
    });
    expect(r.success).toBe(true);
  });
});

describe('contracts hardening (security review, step 1)', () => {
  const base = RolePolicySchema.parse(policy);
  it('permissions.manage is rejected on every role except platform_admin (D-01)', () => {
    for (const role of ['fleet_manager', 'technician', 'consumer_admin'] as const) {
      const bad = { roles: { ...base.roles, [role]: [...base.roles[role], 'permissions.manage'] } };
      expect(RolePolicyUpdateSchema.safeParse(bad).success).toBe(false);
    }
    const tenantPerm = {
      roles: { ...base.roles, platform_admin: ['permissions.manage', 'fleet.view'] },
    };
    expect(RolePolicyUpdateSchema.safeParse(tenantPerm).success).toBe(false);
    expect(RolePolicyUpdateSchema.safeParse({ roles: base.roles }).success).toBe(true);
  });

  it('alert signals are a whitelist: unknown keys are dropped', () => {
    const out = AlertSignalsSchema.parse({ capacity_fade: 1.2, pack_batch: 'X', internal_ref: 7 });
    expect(Object.keys(out)).toEqual(['capacity_fade']);
  });

  it('channel input carries no client id and rejects risky webhook targets', () => {
    const parsed = NotificationChannelInputSchema.parse({
      id: crypto.randomUUID(),
      type: 'email',
      target: 'a@b.co',
      enabled: true,
    });
    expect('id' in parsed).toBe(false);
    for (const t of [
      'https://localhost/x',
      'https://127.0.0.1/x',
      'https://u:p@example.com/x',
      'https://[::1]/x',
    ]) {
      expect(
        NotificationChannelInputSchema.safeParse({ type: 'webhook', target: t, enabled: true })
          .success,
      ).toBe(false);
    }
  });

  it('error details are restricted to issue-shaped entries', () => {
    expect(
      ErrorSchema.safeParse({
        error: { code: 'internal', message: 'x', details: 'Key (consumer_id)=(abc)' },
      }).success,
    ).toBe(false);
  });
});
