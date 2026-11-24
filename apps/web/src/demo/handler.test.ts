import { ErrorSchema } from '@ql/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { MANUFACTURERS, USERS } from './data';
import { demoRequest, resetDemo, setDemoLatency } from './handler';
import { DEMO_POLICY } from './roles';
import {
  BatteryPageSchema,
  DemoMeSchema,
  FleetOverviewSchema,
  MetricListSchema,
  type FleetOverview,
} from './types';
import { BatteryDetailSchema } from './types-battery';
import { ConnectionSchema, LinkResultSchema } from './types-connection';
import { ImportPreviewSchema, ImportResultSchema, ImportsListSchema } from './types-imports';

setDemoLatency(0);

const LRB = MANUFACTURERS.find((m) => m.code === 'LRB')!;
const CPC = MANUFACTURERS.find((m) => m.code === 'CPC')!;
const user = (manufacturerId: string, role: 'battery_manager' | 'admin') =>
  USERS.find((u) => u.manufacturerId === manufacturerId && u.role === role)!;
const manager = user(LRB.id, 'battery_manager'); // Ananya Desai
const admin = user(LRB.id, 'admin'); // Rohan Mehta
const cpcManager = user(CPC.id, 'battery_manager'); // Ines Varga
const cpcAdmin = user(CPC.id, 'admin'); // Tomas Lindqvist

const call = async (method: string, path: string, body?: unknown) => {
  const r = await demoRequest(method, path, body);
  return { status: r.status, json: r.status === 204 ? null : await r.json() };
};
const login = (u: { id: string }) => call('POST', '/auth/mock-login', { userId: u.id });
const get = async <T>(path: string, parse: { parse: (v: unknown) => T }) => {
  const r = await call('GET', path);
  expect(r.status, path).toBe(200);
  return parse.parse(r.json);
};
const sample = async (fileName: string) => {
  const list = await get('/imports', ImportsListSchema);
  return list.sampleFiles.find((f) => f.fileName === fileName)!;
};
const allBatteries = (path = '/batteries') => get(`${path}${path.includes('?') ? '&' : '?'}pageSize=100`, BatteryPageSchema);
const noAsOf = <T extends { asOf: string }>(body: T): Omit<T, 'asOf'> => {
  const rest: Partial<T> = { ...body };
  delete rest.asOf;
  return rest as Omit<T, 'asOf'>;
};

beforeEach(() => resetDemo());

describe('demo API: sign-in', () => {
  it('answers 401 until someone signs in, on every route, and for an unknown user', async () => {
    for (const [method, path] of [
      ['GET', '/me'],
      ['GET', '/metrics'],
      ['GET', '/fleet/overview'],
      ['GET', '/batteries'],
      ['GET', `/batteries/${'a3000000-0000-4000-9000-000000000001'}`],
      ['GET', '/imports'],
      ['POST', '/imports/preview'],
      ['POST', '/imports'],
      ['GET', '/connection'],
      ['POST', '/connection/unmatched/x/link'],
    ] as const) {
      const r = await call(method, path, {});
      expect(r.status, `${method} ${path}`).toBe(401);
      expect(ErrorSchema.safeParse(r.json).success).toBe(true);
    }
    expect((await call('POST', '/auth/mock-login', { userId: 'nope' })).status).toBe(401);
    expect((await call('POST', '/auth/mock-login', {})).status).toBe(401);
    expect((await call('POST', '/auth/mock-login', null)).status).toBe(401);
  });

  it.each(USERS)('/me for $name ($role) matches the schema and the demo policy', async (u) => {
    expect((await login(u)).status).toBe(200);
    const me = await get('/me', DemoMeSchema);
    expect(me.user).toEqual({ id: u.id, name: u.name, role: u.role });
    expect([...me.permissions].sort()).toEqual([...DEMO_POLICY[u.role]].sort());
    expect(me.manufacturer.id).toBe(u.manufacturerId);
  });

  it('a battery manager lacks the admin permissions; an admin has them', async () => {
    await login(manager);
    const m = await get('/me', DemoMeSchema);
    expect(m.permissions).not.toContain('imports.run');
    expect(m.permissions).not.toContain('connection.manage');
    await login(admin);
    const a = await get('/me', DemoMeSchema);
    expect(a.permissions).toEqual(expect.arrayContaining(['imports.run', 'connection.manage']));
  });

  it('sign out ends the session, and a reset forgets the user', async () => {
    await login(manager);
    expect((await call('POST', '/auth/logout')).status).toBe(204);
    expect((await call('GET', '/me')).status).toBe(401);
    await login(manager);
    resetDemo();
    expect((await call('GET', '/me')).status).toBe(401);
  });

  it('an unknown route is a 404 with the error envelope', async () => {
    await login(manager);
    const r = await call('GET', '/not-a-route');
    expect(r.status).toBe(404);
    expect(ErrorSchema.parse(r.json).error.code).toBe('not_found');
  });
});

describe('demo API: permissions per route', () => {
  it('a battery manager can read every screen', async () => {
    await login(manager);
    await get('/metrics', MetricListSchema);
    await get('/fleet/overview', FleetOverviewSchema);
    await get('/batteries', BatteryPageSchema);
    await get('/imports', ImportsListSchema);
    await get('/connection', ConnectionSchema);
  });

  it('a battery manager gets 403 on import preview, import and link, and nothing changes', async () => {
    await login(admin);
    const file = await sample('birth-records-sample.csv');
    const before = noAsOf(await get('/fleet/overview', FleetOverviewSchema));
    const unmatchedId = before.unmatched.ids[0]!.unmatchedId;
    const battery = (await allBatteries()).items[0]!.battery.batteryId;

    await login(manager);
    const body = { fileName: file.fileName, csv: file.csv };
    for (const [path, b] of [
      ['/imports/preview', body],
      ['/imports', body],
      [`/connection/unmatched/${unmatchedId}/link`, { batteryId: battery }],
    ] as const) {
      const r = await call('POST', path, b);
      expect(r.status, path).toBe(403);
      expect(ErrorSchema.parse(r.json).error.code).toBe('forbidden');
    }
    const after = noAsOf(await get('/fleet/overview', FleetOverviewSchema));
    expect(after.registered.value).toBe(before.registered.value);
    expect(after.unmatched.value).toBe(before.unmatched.value);
    expect((await get('/imports', ImportsListSchema)).history).toHaveLength(4);
  });

  it('the permission is checked before the body: a manager sending a bad body still gets 403, an admin 400', async () => {
    await login(manager);
    expect((await call('POST', '/imports', {})).status).toBe(403);
    await login(admin);
    expect((await call('POST', '/imports', {})).status).toBe(400);
  });

  it('a battery manager sees no battery choices to link to; an admin does', async () => {
    await login(manager);
    expect((await get('/connection', ConnectionSchema)).linkable).toEqual([]);
    await login(admin);
    expect((await get('/connection', ConnectionSchema)).linkable).toHaveLength(48);
  });

  // The contracts' error codes have no "method not allowed", so a wrong method is simply not found.
  it('the wrong method on a screen route is a 404', async () => {
    await login(admin);
    expect((await call('POST', '/connection', {})).status).toBe(404);
    expect((await call('GET', '/connection/unmatched/x/link')).status).toBe(404);
  });
});

describe('demo API: overview numbers agree with the data', () => {
  let o: FleetOverview;
  beforeEach(async () => {
    await login(manager);
    o = await get('/fleet/overview', FleetOverviewSchema);
  });

  it('counts the registered batteries, those without a birth record and the unmatched IDs', async () => {
    expect(o.manufacturer).toEqual({ id: LRB.id, name: 'Lumen Ridge Batteries' });
    expect(o.registered.value).toBe(48);
    expect(o.noBirthRecord.value).toBe(2);
    expect(o.noBirthRecord.batteries).toHaveLength(2);
    expect(o.unmatched.value).toBe(2);
    expect(o.unmatched.ids.map((u) => u.idValue).sort()).toEqual(['BMS-0B21D4', 'BMS-7F3A9C']);
    expect(o.unmatched.ids.find((u) => u.idValue === 'BMS-7F3A9C')!.messagesHeld).toBe(488);

    const list = await allBatteries();
    expect(list.total).toBe(48);
    const without = list.items.filter((r) => !r.hasBirthRecord).map((r) => r.battery.batteryId);
    expect(o.noBirthRecord.batteries.map((b) => b.batteryId).sort()).toEqual(without.sort());
  });

  it('the warning counts by severity add up to the open warnings, and match the example rules', async () => {
    const { bySeverity, open } = o.warnings;
    expect(open).toHaveLength(bySeverity.high + bySeverity.medium + bySeverity.low);
    for (const s of ['high', 'medium', 'low'] as const)
      expect(open.filter((w) => w.severity === s)).toHaveLength(bySeverity[s]);
    expect(bySeverity).toEqual({ high: 1, medium: 2, low: 2 });
    // Worst first.
    const rank = { high: 0, medium: 1, low: 2 };
    const ranks = open.map((w) => rank[w.severity]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    // One warning per rule per battery.
    expect(new Set(open.map((w) => `${w.ruleId}/${w.battery.batteryId}`)).size).toBe(open.length);
    // The battery table's per-row counts agree.
    return allBatteries().then((list) => {
      expect(list.items.reduce((a, r) => a + r.openWarnings, 0)).toBe(open.length);
    });
  });

  it('coverage is received over expected, and batteries that never reported are left out', async () => {
    const perBattery = 7 * 24 * 4; // 7 days, one message every 15 minutes
    expect(o.coverage.expected).toBe(47 * perBattery); // one battery has no deployment
    expect(o.coverage.received).toBeLessThan(o.coverage.expected);
    expect(o.coverage.pct).toBe(Math.round((o.coverage.received / o.coverage.expected) * 1000) / 10);
    expect(o.coverage.pct!).toBeGreaterThan(90);
    expect(o.gaps.value).toBe(o.gaps.batteries.length);
    expect(o.gaps.value).toBe(2);
    const cov = o.gaps.batteries.map((g) => g.coveragePct);
    expect(cov).toEqual([...cov].sort((a, b) => a - b));
  });

  it('reporting and the health distribution count only batteries with a value', async () => {
    expect(o.reporting.value).toBe(46); // 48, less one silent for 74 hours and one that never reported
    expect(o.health.n + o.health.excluded).toBe(48);
    expect(o.health.excluded).toBe(1);
    expect(o.health.bands.reduce((a, b) => a + b.count, 0)).toBe(o.health.n);
    expect(o.cycles.bands.reduce((a, b) => a + b.count, 0)).toBe(o.cycles.n);
    expect(o.health.min!).toBeLessThanOrEqual(o.health.median!);
    expect(o.health.median!).toBeLessThanOrEqual(o.health.max!);
  });

  it('every figure carries its basis, and the metric dictionary defines it', async () => {
    const metrics = await get('/metrics', MetricListSchema);
    const known = new Set(metrics.items.map((m) => m.metricId));
    for (const b of [o.registered.basis, o.reporting.basis, o.noBirthRecord.basis, o.coverage.basis, o.gaps.basis, o.unmatched.basis, o.warnings.basis]) {
      expect(b.basedOn.length).toBeGreaterThan(0);
      expect(known.has(b.metricId), b.metricId).toBe(true);
    }
  });
});

describe('demo API: the battery list and a battery', () => {
  beforeEach(() => login(manager));

  it('pages: size 100 and the default, with a total', async () => {
    const all = await get('/batteries?pageSize=100', BatteryPageSchema);
    expect([all.items.length, all.total, all.page, all.pageSize]).toEqual([48, 48, 1, 100]);
    const def = await get('/batteries', BatteryPageSchema);
    expect([def.items.length, def.pageSize]).toEqual([25, 25]);
    const p2 = await get('/batteries?page=2', BatteryPageSchema);
    expect(p2.items).toHaveLength(23);
    expect((await get('/batteries?page=3', BatteryPageSchema)).items).toHaveLength(0);
    const ids = new Set([...def.items, ...p2.items].map((r) => r.battery.batteryId));
    expect(ids.size).toBe(48);
  });

  it('sorts both ways, and puts "not recorded" last', async () => {
    const asc = (await get('/batteries?sort=soh:asc&pageSize=100', BatteryPageSchema)).items.map((r) => r.sohReportedPct);
    const desc = (await get('/batteries?sort=soh:desc&pageSize=100', BatteryPageSchema)).items.map((r) => r.sohReportedPct);
    for (const v of [asc, desc]) {
      expect(v.at(-1)).toBeNull();
      expect(v.filter((x) => x === null)).toHaveLength(1);
    }
    const nums = (v: (number | null)[]) => v.filter((x): x is number => x !== null);
    expect(nums(asc)).toEqual([...nums(asc)].sort((a, b) => a - b));
    expect(nums(desc)).toEqual([...nums(desc)].sort((a, b) => b - a));
    const serials = (await get('/batteries?pageSize=100', BatteryPageSchema)).items.map((r) => r.battery.factorySerial!);
    expect(serials).toEqual([...serials].sort());
  });

  it('searches by serial, holder and model, and treats % and _ as plain text', async () => {
    const first = (await allBatteries()).items.find((r) => !r.hasBirthRecord)!;
    const bySerial = await get(`/batteries?q=${encodeURIComponent(first.battery.factorySerial!.toLowerCase())}`, BatteryPageSchema);
    expect(bySerial.items.map((r) => r.battery.batteryId)).toContain(first.battery.batteryId);
    expect((await get('/batteries?q=Aster%20Freight', BatteryPageSchema)).total).toBeGreaterThan(0);
    expect((await get('/batteries?q=%25', BatteryPageSchema)).total).toBe(0);
    expect((await get('/batteries?q=_', BatteryPageSchema)).total).toBe(0);
    expect((await get('/batteries?q=no-such-battery', BatteryPageSchema)).total).toBe(0);
  });

  it.each([
    '/batteries?sort=password',
    '/batteries?sort=serial:up',
    '/batteries?sort=serial:asc:extra',
    '/batteries?sort=',
    '/batteries?pageSize=101',
    '/batteries?pageSize=0',
    '/batteries?pageSize=abc',
    '/batteries?pageSize=2.5',
    '/batteries?page=0',
    '/batteries?page=-1',
    `/batteries?q=${'x'.repeat(101)}`,
  ])('%s is a 400 with the error envelope', async (path) => {
    const r = await call('GET', path);
    expect(r.status).toBe(400);
    expect(ErrorSchema.parse(r.json).error.code).toBe('validation_failed');
  });

  it('accepts the boundary values: page size 1 and 100, a 100-character search', async () => {
    expect((await get('/batteries?pageSize=1', BatteryPageSchema)).items).toHaveLength(1);
    expect((await get('/batteries?pageSize=100', BatteryPageSchema)).items).toHaveLength(48);
    expect((await get(`/batteries?q=${'x'.repeat(100)}`, BatteryPageSchema)).total).toBe(0);
  });

  it('every battery has a detail page that parses with its schema; an unknown id is a 404', async () => {
    for (const r of (await allBatteries()).items) {
      const d = await get(`/batteries/${r.battery.batteryId}`, BatteryDetailSchema);
      expect(d.battery.batteryId).toBe(r.battery.batteryId);
    }
    const missing = await call('GET', '/batteries/a3000000-0000-4000-9000-999999999999');
    expect(missing.status).toBe(404);
    expect(ErrorSchema.parse(missing.json).error.code).toBe('not_found');
  });
});

describe('demo API: another manufacturer is invisible', () => {
  it('Corvane has its own fleet of 12 and its own unmatched ID', async () => {
    await login(cpcManager);
    const me = await get('/me', DemoMeSchema);
    expect(me.manufacturer.name).toBe('Corvane Power Cells');
    const list = await allBatteries();
    expect(list.total).toBe(12);
    expect(list.items.every((r) => r.battery.factorySerial?.startsWith('CPC-'))).toBe(true);
    const o = await get('/fleet/overview', FleetOverviewSchema);
    expect(o.registered.value).toBe(12);
    expect(o.unmatched.ids.map((u) => u.idValue)).toEqual(['BMS-CPC-ORPHAN']);
  });

  it("Lumen Ridge users get 404 for Corvane's batteries and never see them in any list", async () => {
    await login(cpcManager);
    const theirs = (await allBatteries()).items.map((r) => r.battery);
    const theirIds = new Set(theirs.map((b) => b.batteryId));
    const theirBms = theirs.map((b) => b.bmsId!);
    expect(theirIds.size).toBe(12);

    for (const u of [manager, admin]) {
      await login(u);
      for (const id of theirIds) {
        const r = await call('GET', `/batteries/${id}`);
        expect(r.status, `${u.role} ${id}`).toBe(404);
        expect(ErrorSchema.parse(r.json).error.code).toBe('not_found');
      }
      const mine = await allBatteries();
      expect(mine.items.some((r) => theirIds.has(r.battery.batteryId))).toBe(false);
      expect((await get('/batteries?q=CPC', BatteryPageSchema)).total).toBe(0);
      for (const bms of theirBms) expect((await get(`/batteries?q=${bms}`, BatteryPageSchema)).total).toBe(0);

      const o = await get('/fleet/overview', FleetOverviewSchema);
      const text = JSON.stringify([o, await get('/connection', ConnectionSchema), await get('/imports', ImportsListSchema)]);
      expect(text).not.toContain('CPC-');
      expect(text).not.toContain('BMS-CPC-ORPHAN');
      expect(text).not.toContain('Corvane');
      expect(o.warnings.open.some((w) => theirIds.has(w.battery.batteryId))).toBe(false);
    }
  });

  it('and the other way round: Corvane users cannot reach Lumen Ridge batteries', async () => {
    await login(manager);
    const mine = (await allBatteries()).items.map((r) => r.battery.batteryId);
    await login(cpcAdmin);
    for (const id of mine.slice(0, 5)) expect((await call('GET', `/batteries/${id}`)).status).toBe(404);
    const o = await get('/fleet/overview', FleetOverviewSchema);
    expect(o.unmatched.ids.some((u) => u.idValue === 'BMS-7F3A9C')).toBe(false);
  });

  it('a manufacturer in the query string or body changes nothing: the tenant is the signed-in user', async () => {
    await login(manager);
    const plain = noAsOf(await get('/fleet/overview', FleetOverviewSchema));
    const spoofed = noAsOf(await get(`/fleet/overview?manufacturerId=${CPC.id}&tenant=${CPC.id}`, FleetOverviewSchema));
    expect(spoofed).toEqual(plain);
    const list = await get(`/batteries?pageSize=100&manufacturerId=${CPC.id}`, BatteryPageSchema);
    expect(list.total).toBe(48);
  });

  it('an admin cannot link a Lumen Ridge ID to a Corvane battery, or a Corvane ID at all: 404, nothing changes', async () => {
    await login(cpcManager);
    const cpcBattery = (await allBatteries()).items[0]!.battery.batteryId;
    const cpcUnmatched = (await get('/fleet/overview', FleetOverviewSchema)).unmatched.ids[0]!.unmatchedId;

    await login(admin);
    const lrbUnmatched = (await get('/fleet/overview', FleetOverviewSchema)).unmatched.ids[0]!.unmatchedId;
    const lrbBattery = (await allBatteries()).items[0]!.battery.batteryId;
    expect((await call('POST', `/connection/unmatched/${lrbUnmatched}/link`, { batteryId: cpcBattery })).status).toBe(404);
    expect((await call('POST', `/connection/unmatched/${cpcUnmatched}/link`, { batteryId: lrbBattery })).status).toBe(404);
    expect((await get('/fleet/overview', FleetOverviewSchema)).unmatched.value).toBe(2);

    await login(cpcAdmin);
    expect((await get('/fleet/overview', FleetOverviewSchema)).unmatched.value).toBe(1);
  });

  it("an import file naming Corvane serials matches nothing in Lumen Ridge's fleet", async () => {
    await login(cpcManager);
    const cpcSerial = (await allBatteries()).items[0]!.battery.factorySerial!;
    await login(admin);
    const csv = `factory_serial,holder,site,dispatched_on\n${cpcSerial},Someone,Somewhere,2026-01-05\n`;
    const r = await call('POST', '/imports/preview', { fileName: 'x.csv', csv });
    expect(r.status).toBe(200);
    const p = ImportPreviewSchema.parse(r.json);
    expect(p.counts).toEqual({ loaded: 0, rejected: 0, unmatched: 1 });
    expect(p.rows[0]!.unmatchedReason).toBe('no_match');
  });

  it("an import by Lumen Ridge changes nothing for Corvane", async () => {
    await login(admin);
    const file = await sample('birth-records-sample.csv');
    expect((await call('POST', '/imports', { fileName: file.fileName, csv: file.csv })).status).toBe(200);
    await login(cpcManager);
    const o = await get('/fleet/overview', FleetOverviewSchema);
    expect(o.registered.value).toBe(12);
    expect(o.unmatched.value).toBe(1);
    expect((await get('/imports', ImportsListSchema)).history.every((h) => h.by === cpcAdmin.name)).toBe(true);
  });
});

describe('demo API: birth data import', () => {
  beforeEach(() => login(admin));

  it('lists four sample files and the history, each parsing with its schema', async () => {
    const list = await get('/imports', ImportsListSchema);
    expect(list.sampleFiles.map((f) => f.kind).sort()).toEqual(['birth', 'dispatch', 'lot', 'test']);
    expect(list.history).toHaveLength(4);
  });

  it('a preview reports what would happen and changes nothing', async () => {
    const file = await sample('birth-records-sample.csv');
    const before = {
      overview: noAsOf(await get('/fleet/overview', FleetOverviewSchema)),
      list: noAsOf(await allBatteries()),
      imports: (await get('/imports', ImportsListSchema)).history,
      connection: (await get('/connection', ConnectionSchema)).unmatched,
    };
    const r = await call('POST', '/imports/preview', { fileName: file.fileName, csv: file.csv });
    expect(r.status).toBe(200);
    const p = ImportPreviewSchema.parse(r.json);
    expect(p.kind).toBe('birth');
    expect(p.counts).toEqual({ loaded: 4, rejected: 2, unmatched: 1 });
    expect(p.effects).toEqual({ birthRecordsAdded: 4, batteriesCreated: 2, unmatchedIdsResolved: ['BMS-7F3A9C'] });
    expect(p.unknownColumns).toEqual(['enclosure_rev']);
    expect(p.rows.filter((x) => x.status === 'rejected').map((x) => x.reason)).toEqual(
      expect.arrayContaining([expect.stringContaining('build_date'), 'Factory serial is missing']),
    );

    expect({
      overview: noAsOf(await get('/fleet/overview', FleetOverviewSchema)),
      list: noAsOf(await allBatteries()),
      imports: (await get('/imports', ImportsListSchema)).history,
      connection: (await get('/connection', ConnectionSchema)).unmatched,
    }).toEqual(before);
  });

  it('an import resolves the 2 batteries with no birth record and the unmatched BMS-7F3A9C', async () => {
    const file = await sample('birth-records-sample.csv');
    const noBirth = (await get('/fleet/overview', FleetOverviewSchema)).noBirthRecord.batteries.map((b) => b.batteryId);
    const r = await call('POST', '/imports', { fileName: file.fileName, csv: file.csv });
    expect(r.status).toBe(200);
    const res = ImportResultSchema.parse(r.json);
    expect(res.counts).toEqual({ loaded: 4, rejected: 2, unmatched: 1 });
    expect(res.entry).toMatchObject({ by: admin.name, fileName: file.fileName, kind: 'birth', rowsLoaded: 4 });

    const o = await get('/fleet/overview', FleetOverviewSchema);
    expect(o.noBirthRecord.value).toBe(0);
    expect(o.registered.value).toBe(50); // two new batteries
    expect(o.unmatched.ids.map((u) => u.idValue)).toEqual(['BMS-0B21D4']);
    for (const id of noBirth) expect((await get(`/batteries/${id}`, BatteryDetailSchema)).battery.batteryId).toBe(id);
    expect((await allBatteries()).items.filter((x) => !x.hasBirthRecord)).toHaveLength(0);
    expect((await get('/connection', ConnectionSchema)).unmatched.map((u) => u.idValue)).toEqual(['BMS-0B21D4']);

    const history = (await get('/imports', ImportsListSchema)).history;
    expect(history).toHaveLength(5);
    expect(history[0]!.importId).toBe(res.entry.importId); // newest first
  });

  it('importing the same file again adds no batteries and resolves nothing more', async () => {
    const file = await sample('birth-records-sample.csv');
    const body = { fileName: file.fileName, csv: file.csv };
    await call('POST', '/imports', body);
    const again = ImportResultSchema.parse((await call('POST', '/imports', body)).json);
    expect(again.counts.loaded).toBe(0);
    expect(again.effects).toEqual({ birthRecordsAdded: 0, batteriesCreated: 0, unmatchedIdsResolved: [] });
    expect((await get('/fleet/overview', FleetOverviewSchema)).registered.value).toBe(50);
  });

  it('a reset undoes an import', async () => {
    const file = await sample('birth-records-sample.csv');
    await call('POST', '/imports', { fileName: file.fileName, csv: file.csv });
    resetDemo();
    await login(admin);
    const o = await get('/fleet/overview', FleetOverviewSchema);
    expect([o.registered.value, o.noBirthRecord.value, o.unmatched.value]).toEqual([48, 2, 2]);
    expect((await get('/imports', ImportsListSchema)).history).toHaveLength(4);
  });

  it.each(['test', 'lot', 'dispatch'] as const)('the %s sample file previews cleanly and changes no battery record', async (kind) => {
    const list = await get('/imports', ImportsListSchema);
    const f = list.sampleFiles.find((x) => x.kind === kind)!;
    const p = ImportPreviewSchema.parse((await call('POST', '/imports', { fileName: f.fileName, csv: f.csv })).json);
    expect(p.kind).toBe(kind);
    expect(p.counts.rejected).toBe(0);
    expect(p.counts.unmatched).toBe(0);
    expect(p.counts.loaded).toBeGreaterThan(0);
    expect(p.effects.birthRecordsAdded).toBe(0);
    expect((await get('/fleet/overview', FleetOverviewSchema)).registered.value).toBe(48);
  });

  it.each([
    ['no body', undefined],
    ['an empty body', {}],
    ['a blank file name', { fileName: '   ', csv: 'factory_serial\nA' }],
    ['a file name over 200 characters', { fileName: 'x'.repeat(201), csv: 'factory_serial\nA' }],
    ['empty text', { fileName: 'a.csv', csv: '' }],
    ['text over 1 MB', { fileName: 'a.csv', csv: `factory_serial\n${'x'.repeat(1_000_001)}` }],
    ['text that is not a string', { fileName: 'a.csv', csv: 5 }],
    ['a first line that names no known column', { fileName: 'a.csv', csv: 'foo,bar\n1,2' }],
  ])('%s is a 400 on preview and on import', async (_n, body) => {
    for (const path of ['/imports/preview', '/imports']) {
      const r = await call('POST', path, body);
      expect(r.status, path).toBe(400);
      expect(r.json.error.message).toEqual(expect.any(String));
    }
    expect((await get('/imports', ImportsListSchema)).history).toHaveLength(4);
  });

  it('accepts a file of exactly 1 MB, rejects bad rows one by one, and lets non-birth files repeat a serial', async () => {
    // A dispatch file may name the same battery twice (it moved twice); only birth files reject repeats.
    const dup = 'factory_serial,holder,site,dispatched_on\nLRB-X-1,H,S,2026-02-30\nLRB-X-2,H,S,2026-02-03\nLRB-X-2,H,S,2026-02-03\n,H,S,2026-02-03';
    const p = ImportPreviewSchema.parse((await call('POST', '/imports/preview', { fileName: 'd.csv', csv: dup })).json);
    expect(p.rows.map((r) => r.status)).toEqual(['rejected', 'unmatched', 'unmatched', 'rejected']);
    expect(p.rows[0]!.reason).toContain('dispatched_on');
    const header = 'lot_id,received_on,cells_received\n';
    const exactly = header + 'x'.repeat(1_000_000 - header.length);
    expect(exactly).toHaveLength(1_000_000);
    expect((await call('POST', '/imports/preview', { fileName: 'big.csv', csv: exactly })).status).toBe(200);
  });
});

describe('demo API: linking an unmatched ID', () => {
  it('linking removes it from the overview and connection, records who linked it, and a repeat is a 404', async () => {
    await login(admin);
    const before = await get('/connection', ConnectionSchema);
    const target = before.unmatched.find((u) => u.idValue === 'BMS-7F3A9C')!;
    const battery = before.linkable[0]!;
    const r = await call('POST', `/connection/unmatched/${target.unmatchedId}/link`, { batteryId: battery.batteryId });
    expect(r.status).toBe(200);
    expect(LinkResultSchema.parse(r.json)).toMatchObject({
      idValue: 'BMS-7F3A9C',
      factorySerial: battery.factorySerial,
      messagesReplayed: 488,
    });

    const after = await get('/connection', ConnectionSchema);
    expect(after.unmatched.map((u) => u.idValue)).toEqual(['BMS-0B21D4']);
    expect(after.bases.unmatched.basedOn).toContain('1 BMS ID');
    const o = await get('/fleet/overview', FleetOverviewSchema);
    expect(o.unmatched.value).toBe(1);
    expect(o.unmatched.ids.some((u) => u.idValue === 'BMS-7F3A9C')).toBe(false);

    const detail = await get(`/batteries/${battery.batteryId}`, BatteryDetailSchema);
    expect(JSON.stringify(detail)).toContain('BMS-7F3A9C');
    expect(JSON.stringify(detail)).toContain(admin.name);

    expect((await call('POST', `/connection/unmatched/${target.unmatchedId}/link`, { batteryId: battery.batteryId })).status).toBe(404);
    expect((await get('/fleet/overview', FleetOverviewSchema)).unmatched.value).toBe(1);
  });

  it.each([
    ['no body', undefined],
    ['no battery', {}],
    ['a battery id that is not a UUID', { batteryId: 'nope' }],
    ['a battery id of the wrong type', { batteryId: 7 }],
  ])('%s is a 400 and nothing is linked', async (_n, body) => {
    await login(admin);
    const id = (await get('/connection', ConnectionSchema)).unmatched[0]!.unmatchedId;
    const r = await call('POST', `/connection/unmatched/${id}/link`, body);
    expect(r.status).toBe(400);
    expect(r.json.error.message).toEqual(expect.any(String));
    expect((await get('/connection', ConnectionSchema)).unmatched).toHaveLength(2);
  });

  it('an unknown unmatched id, or an unknown battery, is a 404', async () => {
    await login(admin);
    const c = await get('/connection', ConnectionSchema);
    const real = c.linkable[0]!.batteryId;
    expect((await call('POST', '/connection/unmatched/not-there/link', { batteryId: real })).status).toBe(404);
    const id = c.unmatched[0]!.unmatchedId;
    expect((await call('POST', `/connection/unmatched/${id}/link`, { batteryId: 'a3000000-0000-4000-9000-999999999999' })).status).toBe(404);
    expect((await get('/connection', ConnectionSchema)).unmatched).toHaveLength(2);
  });
});

describe('demo API: connection screen figures', () => {
  it('one row per battery, with a status for never, quiet and reporting, and daily coverage', async () => {
    await login(manager);
    const c = await get('/connection', ConnectionSchema);
    expect(c.batteries).toHaveLength(48);
    const by = (s: string) => c.batteries.filter((b) => b.status === s).length;
    expect([by('reporting'), by('quiet'), by('never')]).toEqual([46, 1, 1]);
    for (const b of c.batteries) expect(b.days).toHaveLength(c.settings.coveragePeriodDays);
    const hours = c.gaps.map((g) => g.hours);
    expect(hours).toEqual([...hours].sort((a, b) => b - a));
    expect(c.unmatched).toHaveLength(2);
  });
});

describe('demo API: error codes match the shared error contract', () => {
  // apiFetch only keeps an error's code and message when ErrorSchema accepts it; anything else becomes
  // "internal / The request failed", so the screen cannot show why a file or a link was refused.
  it('every 4xx the handler sends parses with ErrorSchema', async () => {
    await login(admin);
    const id = (await get('/connection', ConnectionSchema)).unmatched[0]!.unmatchedId;
    const cases: [string, string, unknown][] = [
      ['POST', '/imports', {}],
      ['POST', '/imports/preview', { fileName: 'a.csv', csv: 'foo,bar\n1,2' }],
      ['POST', `/connection/unmatched/${id}/link`, {}],
      ['GET', '/batteries?pageSize=101', undefined],
      ['GET', '/batteries/nope', undefined],
      ['POST', '/connection', {}],
    ];
    for (const [method, path, body] of cases) {
      const r = await call(method, path, body);
      expect(r.status, `${method} ${path}`).toBeGreaterThanOrEqual(400);
      expect(ErrorSchema.safeParse(r.json).success, `${method} ${path} -> ${JSON.stringify(r.json)}`).toBe(true);
    }
  });
});
