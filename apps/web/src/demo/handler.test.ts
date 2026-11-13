import {
  AlertPageSchema,
  AlertSchema,
  ErrorSchema,
  FleetSummarySchema,
  MeSchema,
  PackPageSchema,
} from '@ql/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import policy from '../../../../config/permissions.json';
import { CONSUMERS, USERS } from './data';
import { demoRequest, resetDemo, setDemoLatency } from './handler';

setDemoLatency(0);

const A = CONSUMERS[0]!;
const B = CONSUMERS[1]!;
const as = (consumer: 'A' | 'B' | 'C' | null, role: string) =>
  USERS.find(
    (u) =>
      u.role === role &&
      u.consumerId === (consumer ? CONSUMERS.find((c) => c.code === consumer)!.id : null),
  )!;
const call = async (method: string, path: string, body?: unknown) => {
  const r = await demoRequest(method, path, body);
  return { status: r.status, json: r.status === 204 ? null : await r.json() };
};
const login = (u: { id: string }) => call('POST', '/auth/mock-login', { userId: u.id });

beforeEach(() => resetDemo());

describe('demo API: sign-in', () => {
  it('answers 401 until someone signs in, and for an unknown user', async () => {
    const r = await call('GET', '/me');
    expect(r.status).toBe(401);
    expect(ErrorSchema.safeParse(r.json).success).toBe(true);
    expect((await call('POST', '/auth/mock-login', { userId: 'nope' })).status).toBe(401);
    expect((await call('GET', '/fleet/summary')).status).toBe(401);
  });

  it.each(USERS)(
    '/me for $name ($role) matches the contract and the real permission policy',
    async (u) => {
      expect((await login(u)).status).toBe(200);
      const me = MeSchema.parse((await call('GET', '/me')).json);
      expect(me.user.role).toBe(u.role);
      expect([...me.permissions].sort()).toEqual(
        [...(policy.roles as Record<string, string[]>)[u.role]!].sort(),
      );
      expect(me.consumer?.id ?? null).toBe(u.consumerId);
      expect(me.manufacturer === null).toBe(u.consumerId === null);
    },
  );

  it('sign out ends the session, and a reset forgets the user', async () => {
    await login(as('A', 'fleet_manager'));
    expect((await call('POST', '/auth/logout')).status).toBe(204);
    expect((await call('GET', '/me')).status).toBe(401);
    await login(as('A', 'fleet_manager'));
    resetDemo();
    expect((await call('GET', '/me')).status).toBe(401);
  });
});

describe('demo API: the fleet', () => {
  it('the summary agrees with the pack and alert lists it summarises', async () => {
    await login(as('A', 'fleet_manager'));
    const s = FleetSummarySchema.parse((await call('GET', '/fleet/summary')).json);
    const packs = PackPageSchema.parse((await call('GET', '/packs?pageSize=100')).json);
    const open = AlertPageSchema.parse(
      (await call('GET', '/alerts?status=open&pageSize=100')).json,
    );
    const inService = packs.items.filter((p) => p.status === 'in_service');
    expect(packs.total).toBe(40);
    expect(s.packsInService).toBe(inService.length);
    expect(s.activeAlerts).toBe(open.total);
    expect(s.packsNearingEol).toBe(inService.filter((p) => p.remainingLife!.monthsLow < 6).length);
    expect(s.averageSohPct).toBe(
      Math.round((inService.reduce((a, p) => a + p.sohPct!, 0) / inService.length) * 10) / 10,
    );
  });

  it('has a believable mix: declining, improving and stable packs, and every warranty state', async () => {
    await login(as('A', 'fleet_manager'));
    const { items } = PackPageSchema.parse((await call('GET', '/packs?pageSize=100')).json);
    expect(new Set(items.map((p) => p.trend.direction))).toEqual(
      new Set(['declining', 'improving', 'stable']),
    );
    expect(new Set(items.map((p) => p.warrantyStatus))).toEqual(
      new Set(['active', 'expiring', 'expired']),
    );
    for (const p of items) expect(p.remainingLife!.confidence).toBeGreaterThan(0.5);
  });

  it('pages, sorts and searches like the real API', async () => {
    await login(as('A', 'technician'));
    const p1 = PackPageSchema.parse((await call('GET', '/packs?page=1&pageSize=10')).json);
    const p4 = PackPageSchema.parse((await call('GET', '/packs?page=4&pageSize=10')).json);
    const p5 = PackPageSchema.parse((await call('GET', '/packs?page=5&pageSize=10')).json);
    expect([p1.items.length, p4.items.length, p5.items.length, p1.total]).toEqual([10, 10, 0, 40]);
    const asc = PackPageSchema.parse(
      (await call('GET', '/packs?sort=sohPct:asc&pageSize=100')).json,
    ).items.map((p) => p.sohPct!);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const desc = PackPageSchema.parse(
      (await call('GET', '/packs?sort=sohPct:desc&pageSize=100')).json,
    ).items.map((p) => p.sohPct!);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
    const one = PackPageSchema.parse((await call('GET', '/packs?q=QL-A-0007')).json);
    expect(one.items.map((p) => p.serial)).toEqual(['QL-A-0007']);
    expect(PackPageSchema.parse((await call('GET', '/packs?q=%25')).json).total).toBe(0); // % is literal
  });

  it.each([
    '/packs?sort=password',
    '/packs?sort=serial:up',
    '/packs?pageSize=101',
    '/packs?page=0',
    '/alerts?severity=urgent',
    '/alerts?status=deleted',
    '/alerts?sort=packId',
  ])('%s is a 400 with the error envelope', async (path) => {
    await login(as('A', 'fleet_manager'));
    const r = await call('GET', path);
    expect(r.status).toBe(400);
    expect(ErrorSchema.parse(r.json).error.code).toBe('validation_failed');
  });

  it('every consumer sees only its own fleet', async () => {
    await login(as('A', 'fleet_manager'));
    const a = PackPageSchema.parse((await call('GET', '/packs?pageSize=100')).json);
    const aAlerts = AlertPageSchema.parse((await call('GET', '/alerts?pageSize=100')).json);
    await login(as('B', 'fleet_manager'));
    const b = PackPageSchema.parse((await call('GET', '/packs?pageSize=100')).json);
    expect(a.items.every((p) => p.serial.startsWith('QL-A-'))).toBe(true);
    expect(b.items.every((p) => p.serial.startsWith('QL-B-'))).toBe(true);
    const aIds = new Set(a.items.map((p) => p.id));
    expect(b.items.some((p) => aIds.has(p.id))).toBe(false);
    expect(PackPageSchema.parse((await call('GET', '/packs?q=QL-A-0001')).json).total).toBe(0);
    // B cannot touch A's alert: it is simply not there.
    expect(
      (
        await call(
          'POST',
          `/alerts/${aAlerts.items.find((x) => x.status === 'open')!.id}/acknowledge`,
        )
      ).status,
    ).toBe(404);
  });
});

describe('demo API: permissions follow the real policy', () => {
  it('a technician sees alerts but cannot acknowledge (403), and nothing changes', async () => {
    await login(as('A', 'technician'));
    const open = AlertPageSchema.parse((await call('GET', '/alerts?status=open')).json);
    const r = await call('POST', `/alerts/${open.items[0]!.id}/acknowledge`);
    expect(r.status).toBe(403);
    expect(AlertPageSchema.parse((await call('GET', '/alerts?status=open')).json).total).toBe(
      open.total,
    );
  });

  it('the platform admin has no fleet: every fleet endpoint is a 403', async () => {
    await login(as(null, 'platform_admin'));
    for (const path of ['/fleet/summary', '/packs', '/alerts'])
      expect((await call('GET', path)).status, path).toBe(403);
  });

  it('a fleet manager acknowledges: who and when are recorded, the count drops, and a repeat changes nothing', async () => {
    const fm = as('A', 'fleet_manager');
    await login(fm);
    const before = FleetSummarySchema.parse(
      (await call('GET', '/fleet/summary')).json,
    ).activeAlerts;
    const target = AlertPageSchema.parse((await call('GET', '/alerts?status=open')).json).items[0]!;
    const first = AlertSchema.parse((await call('POST', `/alerts/${target.id}/acknowledge`)).json);
    expect(first).toMatchObject({ status: 'acknowledged', acknowledgedBy: fm.name });
    expect(FleetSummarySchema.parse((await call('GET', '/fleet/summary')).json).activeAlerts).toBe(
      before - 1,
    );
    await login(as('A', 'consumer_admin'));
    const again = AlertSchema.parse((await call('POST', `/alerts/${target.id}/acknowledge`)).json);
    expect(again.acknowledgedBy).toBe(fm.name); // the original acknowledgement is kept
    expect(again.acknowledgedAt).toBe(first.acknowledgedAt);
  });

  it('a resolved alert is a 409 and an unknown one a 404', async () => {
    await login(as('A', 'fleet_manager'));
    const resolved = AlertPageSchema.parse((await call('GET', '/alerts?status=resolved')).json)
      .items[0]!;
    expect((await call('POST', `/alerts/${resolved.id}/acknowledge`)).status).toBe(409);
    expect((await call('POST', '/alerts/not-there/acknowledge')).status).toBe(404);
  });

  it('changes last only until the demo is reset', async () => {
    await login(as('A', 'fleet_manager'));
    const target = AlertPageSchema.parse((await call('GET', '/alerts?status=open')).json).items[0]!;
    await call('POST', `/alerts/${target.id}/acknowledge`);
    resetDemo();
    await login(as('A', 'fleet_manager'));
    const reopened = AlertPageSchema.parse(
      (await call('GET', '/alerts?status=open&pageSize=100')).json,
    );
    expect(reopened.items.some((a) => a.id === target.id)).toBe(true);
  });

  it('every alert severity and status exists for every consumer', async () => {
    for (const c of [A, B, CONSUMERS[2]!]) {
      await login(USERS.find((u) => u.consumerId === c.id && u.role === 'fleet_manager')!);
      const { items } = AlertPageSchema.parse((await call('GET', '/alerts?pageSize=100')).json);
      expect(new Set(items.map((a) => `${a.severity}/${a.status}`)).size).toBe(9);
    }
  });
});
