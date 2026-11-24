// Endpoints for the connection screen. Everything is scoped to ctx.tenant.
import { EXAMPLE_SETTINGS } from '../data';
import { buildBatteryDetail } from '../data-battery';
import { buildConnectors, buildUnknownFields } from '../data-connection';
import type { Basis } from '../types';
import {
  ConnectionSchema,
  LinkBodySchema,
  LinkResultSchema,
  type BatteryReporting,
  type Connection,
} from '../types-connection';
import { fail, notFound, reply, type RouteContext, type RouteModule } from './context';

const HOUR = 3_600_000;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const iso = (t: number) => new Date(t).toISOString();

function connection(ctx: RouteContext): Connection {
  const t = ctx.tenant;
  const s = EXAMPLE_SETTINGS;
  const calcAt = t.freshness.calculations;
  const basis = (metricId: string, basedOn: string, caveats: string[] = []): Basis => ({
    metricId,
    calculatedAt: calcAt,
    basedOn,
    caveats,
  });
  const canLink = ctx.need('connection.manage') === null;

  const details = t.batteries.map((b) => ({ b, d: buildBatteryDetail(b, t.now) }));
  const rows: BatteryReporting[] = details.map(({ b, d }) => {
    const hrs = b.calc.lastSeenAt === null ? null : (t.now - Date.parse(b.calc.lastSeenAt)) / HOUR;
    return {
      batteryId: b.id,
      factorySerial: b.factorySerial,
      bmsId: b.bmsId,
      status: hrs === null ? 'never' : hrs <= s.reportingWindowHours ? 'reporting' : 'quiet',
      lastSeenAt: b.calc.lastSeenAt,
      coveragePct: pct(b.calc.received, b.calc.expected),
      days: d.dailyCoverage.map((c) => ({ ...c, pct: pct(c.received, c.expected) })),
      longestGapHours: b.calc.longestGapHours,
    };
  });
  const gaps = details
    .flatMap(({ b, d }) =>
      d.gaps.map((g) => ({
        batteryId: b.id,
        factorySerial: b.factorySerial,
        from: g.from,
        to: g.to,
        hours: g.hours,
        ongoing: t.now - Date.parse(g.to) < 60_000,
      })),
    )
    .sort((x, y) => y.hours - x.hours);

  const served = t.batteries.filter((b) => b.calc.lastSeenAt !== null);
  const received = served.reduce((a, b) => a + b.calc.received, 0);
  const expected = served.reduce((a, b) => a + b.calc.expected, 0);
  const connectors = buildConnectors(t.manufacturer, t.now).map((c) => ({
    ...c,
    coveragePct: c.status === 'active' ? pct(received, expected) : null,
  }));
  const periodNote = `Last ${s.coveragePeriodDays} days at one message every ${s.sendIntervalMinutes} minutes (example settings).`;

  return {
    settings: {
      reportingWindowHours: s.reportingWindowHours,
      sendIntervalMinutes: s.sendIntervalMinutes,
      coveragePeriodDays: s.coveragePeriodDays,
      gapLongerThanHours: s.gapLongerThanHours,
    },
    updated: { bms: t.freshness.bms, calculations: calcAt },
    connectors,
    batteries: rows,
    gaps,
    unknownFields: buildUnknownFields(t.manufacturer, t.now),
    unmatched: t.unmatched.map((u) => ({
      unmatchedId: u.id,
      idValue: u.idValue,
      firstSeenAt: u.firstSeenAt,
      lastSeenAt: u.lastSeenAt,
      messagesHeld: u.messagesHeld,
    })),
    linkable: canLink ? t.batteries.map((b) => ({ batteryId: b.id, factorySerial: b.factorySerial })) : [],
    bases: {
      connectorLastSeen: basis('connector_last_seen_at', 'The receipt time of the latest message through each connector.'),
      connectorReceived: basis('connector_messages_received', 'Messages through each connector in the last 24 hours.'),
      connectorRejected: basis(
        'connector_messages_rejected',
        'Rejected messages through each connector in the last 24 hours, by reason. Rejected messages are kept as received.',
      ),
      connectorCoverage: basis('connector_data_coverage_pct', periodNote, ['In this demo the active connector serves every battery that has reported and the disabled one serves none, so it has no coverage. How batteries map to connectors is not decided yet [__].']),
      lastSeen: basis('last_seen_at', 'The receipt time of the latest message from each battery.'),
      coverageDaily: basis('data_coverage_daily_pct', periodNote, ['A battery that is not yet deployed has nothing expected.']),
      gaps: basis('data_gaps', `Silences longer than ${s.gapLongerThanHours} hours in the last ${s.coveragePeriodDays} days.`),
      unknownFields: basis('unknown_fields_received', 'Field names in BMS messages that the platform does not recognise yet.'),
      unmatched: basis(
        'unmatched_id_count',
        `${t.unmatched.length} BMS ${t.unmatched.length === 1 ? 'ID' : 'IDs'} with ${t.unmatched.reduce((a, u) => a + u.messagesHeld, 0)} messages held.`,
        ['Held data is in no figure until the ID is linked.'],
      ),
    },
    asOf: iso(t.now),
  };
}

export const connectionRoutes: RouteModule = (ctx) => {
  const p = ctx.url.pathname;
  if (p === '/connection') {
    if (ctx.method !== 'GET') return notFound();
    const denied = ctx.need('connection.view');
    if (denied) return denied;
    return reply(200, ConnectionSchema.parse(connection(ctx)));
  }
  const m = /^\/connection\/unmatched\/([^/]+)\/link$/.exec(p);
  if (m) {
    if (ctx.method !== 'POST') return notFound();
    const denied = ctx.need('connection.manage');
    if (denied) return denied;
    const body = LinkBodySchema.safeParse(ctx.body);
    if (!body.success) return fail(400, 'validation_failed', 'Choose a battery to link this ID to.');
    const t = ctx.tenant;
    const idx = t.unmatched.findIndex((u) => u.id === m[1]);
    const battery = t.batteries.find((b) => b.id === body.data.batteryId);
    const u = t.unmatched[idx];
    if (!u || !battery) return notFound();
    t.unmatched.splice(idx, 1);
    t.linkedIds.push({
      batteryId: battery.id,
      idType: 'bms_id',
      idValue: u.idValue,
      linkedAt: iso(t.now),
      by: ctx.user.name,
      messagesReplayed: u.messagesHeld,
    });
    return reply(
      200,
      LinkResultSchema.parse({
        idValue: u.idValue,
        factorySerial: battery.factorySerial,
        messagesReplayed: u.messagesHeld,
        asOf: iso(t.now),
      }),
    );
  }
  return null;
};
