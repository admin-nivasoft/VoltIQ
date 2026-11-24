// Endpoints for the battery screen: GET /batteries/:batteryId. The battery is looked up only inside
// the signed-in user's own manufacturer, so another manufacturer's battery is simply "not found".
import { EXAMPLE_SETTINGS, RULE_LIMITS, type DemoBattery } from '../data';
import { buildBatteryDetail } from '../data-battery';
import { METRICS } from '../metrics';
import type { Basis, Severity } from '../types';
import type { BatteryDetail, BatteryWarning, Figure } from '../types-battery';
import type { Tenant } from '../world';
import { notFound, reply, type RouteModule } from './context';

const HOUR = 3_600_000;
const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
/** One period for max temperature and faults (SCR-03-FR-05). */
const FIELD_PERIOD_DAYS = 30;
const PATH = /^\/batteries\/([^/]+)$/;

export const batteryRoutes: RouteModule = (ctx) => {
  const match = ctx.method === 'GET' ? PATH.exec(ctx.url.pathname) : null;
  if (!match) return null;
  const denied = ctx.need('batteries.view');
  if (denied) return denied;
  let id: string;
  try {
    id = decodeURIComponent(match[1]!);
  } catch {
    return notFound();
  }
  const index = ctx.tenant.batteries.findIndex((b) => b.id === id);
  const b = ctx.tenant.batteries[index];
  if (!b) return notFound();
  return reply(200, detail(ctx.tenant, b, index));
};

function warningsFor(t: Tenant, b: DemoBattery, i: number, history: { sohPct: number }[]): BatteryWarning[] {
  const rule = (id: string) => EXAMPLE_SETTINGS.rules.find((r) => r.ruleId === id)!;
  const days = EXAMPLE_SETTINGS.coveragePeriodDays;
  const out: BatteryWarning[] = [];
  const raise = (ruleId: string, observed: string, hoursAgo: number, explanation: string, trend: string | null = null) => {
    const r = rule(ruleId);
    out.push({
      ruleId,
      condition: r.condition,
      severity: r.severity,
      observed,
      detectedAt: new Date(t.now - hoursAgo * HOUR).toISOString(),
      explanation,
      trend,
    });
  };
  if (b.calc.maxTempC !== null && b.calc.maxTempC > RULE_LIMITS.tempC)
    raise(
      'high_temp',
      `${b.calc.maxTempC.toFixed(1)} °C`,
      3.2,
      `The highest cell temperature in the last ${FIELD_PERIOD_DAYS} days is ${b.calc.maxTempC.toFixed(1)} °C. The example rule warns above ${RULE_LIMITS.tempC} °C.`,
    );
  if (b.calc.spreadMv !== null && b.calc.spreadMv > RULE_LIMITS.spreadMv)
    raise(
      'cell_imbalance',
      `${b.calc.spreadMv} mV`,
      19,
      `The largest gap between the highest and lowest cell voltage in the last ${days} days is ${b.calc.spreadMv} mV. The example rule warns above ${RULE_LIMITS.spreadMv} mV.`,
    );
  const silent = b.calc.lastSeenAt === null ? null : (t.now - Date.parse(b.calc.lastSeenAt)) / HOUR;
  if (silent !== null && silent > RULE_LIMITS.noDataHours)
    raise(
      'no_data',
      `Last data ${Math.round(silent)} h ago`,
      silent - RULE_LIMITS.noDataHours,
      `No message from this battery has arrived for ${Math.round(silent)} hours. The example rule warns after ${RULE_LIMITS.noDataHours} hours of silence.`,
    );
  if (b.reported.sohPct !== null && b.reported.sohPct < RULE_LIMITS.sohPct) {
    const first = history[0];
    const trend =
      first && history.length > 1
        ? `Health reported by the BMS moved from ${first.sohPct.toFixed(1)}% to ${b.reported.sohPct.toFixed(1)}% over the history shown.`
        : null;
    raise(
      'soh_low',
      `${b.reported.sohPct.toFixed(1)}%`,
      52 + i,
      `Health reported by the BMS is ${b.reported.sohPct.toFixed(1)}%. The example rule warns below ${RULE_LIMITS.sohPct}%.`,
      trend,
    );
  }
  return out.sort(
    (a, c) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[c.severity] || c.detectedAt.localeCompare(a.detectedAt),
  );
}

function detail(t: Tenant, b: DemoBattery, index: number): BatteryDetail {
  const d = buildBatteryDetail(b, t.now);
  const s = EXAMPLE_SETTINGS;
  const calcAt = t.freshness.calculations;
  const lastSeen = b.calc.lastSeenAt;
  const pct = b.calc.expected > 0 ? Math.round((b.calc.received / b.calc.expected) * 1000) / 10 : null;
  const lowCoverage = pct !== null && pct < s.gapCoverageBelowPct;

  const figures: Record<string, Figure> = {};
  const add = (metricId: string, updatedAt: string | null, basedOn: string, caveats: string[] = []) => {
    const def = METRICS.find((m) => m.metricId === metricId);
    const basis: Basis = { metricId, calculatedAt: updatedAt ?? calcAt, basedOn, caveats };
    figures[metricId] = { source: def?.source ?? 'calculated', updatedAt, basis };
  };
  const never = lastSeen === null ? ['This battery has never sent data.'] : [];
  const thin = lowCoverage
    ? [`Only ${pct}% of expected messages arrived in the last ${s.coveragePeriodDays} days, so a short spike could be missed.`]
    : [];
  const periodText = `readings from the last ${s.coveragePeriodDays} days`;

  add('soh_reported_pct', lastSeen, 'The latest health value this battery’s BMS sent. Nothing is calculated.', never);
  add('cycle_count_reported', lastSeen, 'The latest cycle count this battery’s BMS sent. Nothing is calculated.', never);
  add('soc_pct', lastSeen, 'The latest state-of-charge value this battery’s BMS sent.', never);
  add(
    'soh_reported_history',
    lastSeen,
    `${d.sohHistory.length} health values the BMS sent, in time order.`,
    d.sohHistory.length ? [] : ['No health value has been reported yet.'],
  );
  add('max_temp_c', lastSeen === null ? null : calcAt, `Good-quality temperature readings from the last ${FIELD_PERIOD_DAYS} days.`, [...never, ...thin]);
  add('cell_voltage_spread_mv', lastSeen === null ? null : calcAt, `Cell voltage ${periodText}.`, [...never, ...thin]);
  add('fault_count', lastSeen === null ? null : calcAt, `Fault events the BMS reported in the last ${FIELD_PERIOD_DAYS} days.`, never);
  add('last_seen_at', lastSeen === null ? null : calcAt, 'The receipt time of the newest message from this battery.', never);
  add(
    'data_coverage_pct',
    calcAt,
    `${b.calc.received} of ${b.calc.expected} expected messages in the last ${s.coveragePeriodDays} days.`,
    b.calc.expected === 0 ? ['This battery has not been deployed long enough to expect messages.'] : [],
  );
  add('data_coverage_daily_pct', calcAt, `Messages received each day against the ${s.sendIntervalMinutes}-minute send interval (example setting).`);
  add('data_gaps', calcAt, `Silences longer than ${s.gapLongerThanHours} hours in the last ${s.coveragePeriodDays} days (example setting).`);
  add(
    'build_date',
    b.birth ? t.freshness.registry : null,
    'Read from the factory factory record imported by an Admin.',
    b.birth ? [] : ['This battery has no factory record.'],
  );

  const linked = t.linkedIds
    .filter((l) => l.batteryId === b.id)
    .map((l) => ({
      idType: l.idType,
      value: l.idValue,
      source: 'bms' as const,
      linkedAt: l.linkedAt,
      linkedBy: l.by,
      messagesReplayed: l.messagesReplayed,
    }));

  const x = d.birthExtras;
  return {
    battery: {
      batteryId: b.id,
      factorySerial: b.factorySerial,
      bmsId: b.bmsId,
      model: b.birth?.model ?? null,
      holder: b.deployment?.holder ?? null,
      site: b.deployment?.site ?? null,
    },
    birth: b.birth
      ? {
          ...b.birth,
          shift: x?.shift ?? null,
          cellSupplier: x?.cellSupplier ?? null,
          cellLots: x?.cellLots ?? [],
          gradeSpread: x?.gradeSpread ?? null,
          eolResult: x?.eolResult ?? null,
          eolDate: x?.eolDate ?? null,
          firmwareAtBuild: x?.firmwareAtBuild ?? null,
        }
      : null,
    warnings: warningsFor(t, b, index, d.sohHistory),
    field: {
      sohPct: b.reported.sohPct,
      cycles: b.reported.cycles,
      socPct: b.reported.socPct,
      maxTempC: b.calc.maxTempC,
      spreadMv: b.calc.spreadMv,
      faultCount30d: d.faultCount30d,
      lastSeenAt: lastSeen,
      tempPeriodDays: FIELD_PERIOD_DAYS,
      faultPeriodDays: FIELD_PERIOD_DAYS,
    },
    sohHistory: d.sohHistory,
    sohRuleLimitPct: RULE_LIMITS.sohPct,
    cellVoltages: d.cellVoltages,
    cells: d.cells,
    deployments: d.deployments,
    coverage: {
      pct,
      received: b.calc.received,
      expected: b.calc.expected,
      periodDays: s.coveragePeriodDays,
      longestGapHours: b.calc.longestGapHours,
      gapLimitHours: s.gapLongerThanHours,
      daily: d.dailyCoverage,
      gaps: d.gaps,
    },
    identifiers: [...d.identifiers.map((i) => ({ ...i, linkedBy: null, messagesReplayed: null })), ...linked],
    figures,
    updated: { ...t.freshness },
    asOf: new Date().toISOString(),
  };
}
