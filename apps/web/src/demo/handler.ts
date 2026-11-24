// A tiny in-browser stand-in for the API, used only when the app is built with VITE_DEMO=true.
// It answers with demo-only shapes (src/demo/types.ts; the screens validate every response against
// them) and applies the same rules the API must: the tenant (manufacturer) comes from the signed-in
// user only, every route checks a permission, another manufacturer's data is never reachable, and
// figures are worked out from the per-battery records the way bpte/data-model/metrics.md defines them.
// Nothing leaves the browser, and nothing is saved: a reload starts again.
import {
  BATTERY_COUNT,
  buildBatteries,
  buildFreshness,
  buildUnmatched,
  EXAMPLE_SETTINGS,
  MANUFACTURERS,
  RULE_LIMITS,
  USERS,
  type DemoBattery,
  type DemoManufacturer,
  type DemoUnmatched,
  type DemoUser,
} from './data';
import { METRICS } from './metrics';
import { DEMO_POLICY } from './roles';
import type {
  Basis,
  BatteryRef,
  BatteryRow,
  DemoMe,
  DemoPermission,
  Distribution,
  FleetOverview,
  OpenWarning,
  Severity,
} from './types';

const STORAGE_KEY = 'ql-demo-user';
let latencyMs = 250; // long enough to show the loading skeletons, short enough not to annoy
/** Tests turn the artificial delay off. */
export const setDemoLatency = (ms: number) => {
  latencyMs = ms;
};

interface Tenant {
  manufacturer: DemoManufacturer;
  batteries: DemoBattery[];
  unmatched: DemoUnmatched[];
  freshness: ReturnType<typeof buildFreshness>;
  now: number;
}
let tenants: Map<string, Tenant> | null = null;
let currentUserId: string | null | undefined;

function world(): Map<string, Tenant> {
  if (!tenants) {
    const now = Date.now();
    tenants = new Map(
      MANUFACTURERS.map((m) => [
        m.id,
        {
          manufacturer: m,
          batteries: buildBatteries(m, now, BATTERY_COUNT[m.id] ?? 0),
          unmatched: buildUnmatched(m, now),
          freshness: buildFreshness(now),
          now,
        },
      ]),
    );
  }
  return tenants;
}

function readUser(): DemoUser | null {
  if (currentUserId === undefined) {
    try {
      currentUserId = sessionStorage.getItem(STORAGE_KEY);
    } catch {
      currentUserId = null;
    }
  }
  return USERS.find((u) => u.id === currentUserId) ?? null;
}
function writeUser(id: string | null) {
  currentUserId = id;
  try {
    if (id) sessionStorage.setItem(STORAGE_KEY, id);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode: the demo user is simply held in memory.
  }
}

/** Forgets the demo user and every change made, then lets the caller reload. */
export function resetDemo(): void {
  tenants = null;
  writeUser(null);
}

const reply = (status: number, body?: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body ?? {}), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const fail = (status: number, code: string, message: string) =>
  reply(status, { error: { code, message } });

function intParam(url: URL, name: string, def: number, min: number, max: number): number | null {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === '') return def;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

// ---------------------------------------------------------------- calculations (metrics.md v1)

const HOUR = 3_600_000;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pct = (num: number, den: number) => (den === 0 ? null : Math.round((num / den) * 1000) / 10);
const ref = (b: DemoBattery): BatteryRef => ({
  batteryId: b.id,
  factorySerial: b.factorySerial,
  bmsId: b.bmsId,
});
const hoursSince = (t: Tenant, at: string | null) =>
  at === null ? null : (t.now - Date.parse(at)) / HOUR;

function median(sorted: number[]): number | null {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function distribution(
  t: Tenant,
  metricId: string,
  values: (number | null)[],
  band: number,
  describe: (n: number, total: number) => string,
  caveats: string[],
): Distribution {
  const have = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  const excluded = values.length - have.length;
  const bands: Distribution['bands'] = [];
  if (have.length) {
    const start = Math.floor(have[0]! / band) * band;
    for (let from = start; from <= have[have.length - 1]!; from += band) {
      bands.push({ from, to: from + band, count: have.filter((v) => v >= from && v < from + band).length });
    }
  }
  const mean = have.length ? Math.round((have.reduce((a, b) => a + b, 0) / have.length) * 10) / 10 : null;
  return {
    n: have.length,
    excluded,
    min: have[0] ?? null,
    median: median(have),
    max: have[have.length - 1] ?? null,
    mean,
    bands,
    basis: {
      metricId,
      calculatedAt: t.freshness.calculations,
      basedOn: describe(have.length, values.length),
      caveats: [
        ...(excluded
          ? [`${plural(excluded, 'battery', 'batteries')} with no reported value ${excluded === 1 ? 'is' : 'are'} left out.`]
          : []),
        ...caveats,
      ],
    },
  };
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** Runs the example rules over each battery's latest values. One warning per rule per battery. */
function openWarnings(t: Tenant): OpenWarning[] {
  const rule = (id: string) => EXAMPLE_SETTINGS.rules.find((r) => r.ruleId === id)!;
  const out: OpenWarning[] = [];
  t.batteries.forEach((b, i) => {
    const raise = (ruleId: string, observed: string | null, hoursAgo: number) => {
      const r = rule(ruleId);
      out.push({
        warningId: `${b.id.slice(0, 1)}5${String(out.length + 1).padStart(6, '0')}-0000-4000-9000-${String(i + 1).padStart(12, '0')}`,
        battery: ref(b),
        ruleId,
        condition: r.condition,
        severity: r.severity,
        observed,
        detectedAt: new Date(t.now - hoursAgo * HOUR).toISOString(),
      });
    };
    if (b.calc.maxTempC !== null && b.calc.maxTempC > RULE_LIMITS.tempC)
      raise('high_temp', `${b.calc.maxTempC.toFixed(1)} °C`, 3.2);
    if (b.calc.spreadMv !== null && b.calc.spreadMv > RULE_LIMITS.spreadMv)
      raise('cell_imbalance', `${b.calc.spreadMv} mV`, 19);
    const silent = hoursSince(t, b.calc.lastSeenAt);
    if (silent !== null && silent > RULE_LIMITS.noDataHours)
      raise('no_data', `Last data ${Math.round(silent)} h ago`, silent - RULE_LIMITS.noDataHours);
    if (b.reported.sohPct !== null && b.reported.sohPct < RULE_LIMITS.sohPct)
      raise('soh_low', `${b.reported.sohPct.toFixed(1)}%`, 52 + i);
  });
  return out.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.detectedAt.localeCompare(a.detectedAt),
  );
}

function overview(t: Tenant): FleetOverview {
  const s = EXAMPLE_SETTINGS;
  const bs = t.batteries;
  const N = bs.length;
  const calcAt = t.freshness.calculations;
  const basis = (metricId: string, basedOn: string, caveats: string[] = []): Basis => ({
    metricId,
    calculatedAt: calcAt,
    basedOn,
    caveats,
  });

  const noBirth = bs.filter((b) => b.birth === null);
  const neverReported = bs.filter((b) => b.calc.lastSeenAt === null);
  const reporting = bs.filter((b) => {
    const hrs = hoursSince(t, b.calc.lastSeenAt);
    return hrs !== null && hrs <= s.reportingWindowHours;
  });
  const deployed = bs.filter((b) => b.calc.expected > 0);
  const received = deployed.reduce((a, b) => a + b.calc.received, 0);
  const expected = deployed.reduce((a, b) => a + b.calc.expected, 0);
  const gapRows = deployed
    .map((b) => ({ b, cov: pct(b.calc.received, b.calc.expected) ?? 0 }))
    .filter(({ b, cov }) => cov < s.gapCoverageBelowPct || b.calc.longestGapHours > s.gapLongerThanHours)
    .sort((x, y) => x.cov - y.cov);
  const warnings = openWarnings(t);
  const bySeverity = { high: 0, medium: 0, low: 0 };
  warnings.forEach((w) => (bySeverity[w.severity] += 1));
  const stale = bs.filter((b) => {
    const hrs = hoursSince(t, b.calc.lastSeenAt);
    return b.reported.sohPct !== null && hrs !== null && hrs > s.reportingWindowHours;
  });
  const staleNote = stale.length
    ? [`${plural(stale.length, 'battery', 'batteries')} stopped reporting, so ${stale.length === 1 ? 'its' : 'their'} latest value is older than ${s.reportingWindowHours} hours.`]
    : [];
  const neverNote = neverReported.length
    ? [`${plural(neverReported.length, 'battery', 'batteries')} ${neverReported.length === 1 ? 'has' : 'have'} never reported, so no rule can look at ${neverReported.length === 1 ? 'it' : 'them'}.`]
    : [];
  const held = t.unmatched.reduce((a, u) => a + u.messagesHeld, 0);

  return {
    manufacturer: { id: t.manufacturer.id, name: t.manufacturer.name },
    settings: s,
    registered: {
      value: N,
      basis: basis(
        'batteries_registered',
        `${plural(N, 'battery record')}: ${N - noBirth.length} from birth records, ${noBirth.length} entered by an Admin.`,
        noBirth.length
          ? [`${plural(noBirth.length, 'battery', 'batteries')} ${noBirth.length === 1 ? 'has' : 'have'} no birth record, so build date, model and rated capacity are not recorded for ${noBirth.length === 1 ? 'it' : 'them'}.`]
          : [],
      ),
    },
    reporting: {
      value: reporting.length,
      basis: basis(
        'batteries_reporting',
        `Last message time of ${plural(N, 'battery', 'batteries')}, against a ${s.reportingWindowHours}-hour window (example setting).`,
        neverReported.length
          ? [`${plural(neverReported.length, 'battery', 'batteries')} ${neverReported.length === 1 ? 'has' : 'have'} never reported: no deployment is recorded.`]
          : [],
      ),
    },
    noBirthRecord: {
      value: noBirth.length,
      batteries: noBirth.map(ref),
      basis: basis('batteries_no_birth_record', `Battery records compared with birth records for all ${N} batteries.`),
    },
    health: distribution(
      t,
      'fleet_soh_reported_distribution',
      bs.map((b) => b.reported.sohPct),
      s.healthBandPct,
      (n, total) => `Latest reported value from ${n} of ${total} batteries. Bands of ${s.healthBandPct} percentage points (example setting).`,
      [
        ...staleNote,
        'These are the BMS’s own figures. We do not calculate health yet, so they have not been checked against capacity tests.',
      ],
    ),
    cycles: distribution(
      t,
      'fleet_cycle_count_distribution',
      bs.map((b) => b.reported.cycles),
      s.cycleBand,
      (n, total) => `Latest reported counter from ${n} of ${total} batteries. Bands of ${s.cycleBand} cycles (example setting).`,
      [...staleNote, 'These are the BMS’s own counts. We do not calculate cycles yet.'],
    ),
    coverage: {
      pct: pct(received, expected),
      received,
      expected,
      basis: basis(
        'fleet_data_coverage_pct',
        `${received.toLocaleString('en-GB')} of ${expected.toLocaleString('en-GB')} expected messages from ${plural(deployed.length, 'deployed battery', 'deployed batteries')} over the last ${s.coveragePeriodDays} days, at one message every ${s.sendIntervalMinutes} minutes (example settings).`,
        bs.length > deployed.length
          ? [`${plural(bs.length - deployed.length, 'battery', 'batteries')} ${bs.length - deployed.length === 1 ? 'has' : 'have'} no deployment recorded, so nothing is expected and ${bs.length - deployed.length === 1 ? 'it is' : 'they are'} left out.`]
          : [],
      ),
    },
    gaps: {
      value: gapRows.length,
      batteries: gapRows.map(({ b, cov }) => ({
        battery: ref(b),
        coveragePct: cov,
        longestGapHours: b.calc.longestGapHours,
        lastSeenAt: b.calc.lastSeenAt,
      })),
      basis: basis(
        'batteries_with_gaps',
        `Coverage and longest silence of ${plural(deployed.length, 'deployed battery', 'deployed batteries')} over the last ${s.coveragePeriodDays} days. Limits: coverage below ${s.gapCoverageBelowPct}% or a gap longer than ${s.gapLongerThanHours} hours (example settings).`,
      ),
    },
    unmatched: {
      value: t.unmatched.length,
      ids: t.unmatched.map((u) => ({
        unmatchedId: u.id,
        idType: 'bms_id' as const,
        idValue: u.idValue,
        firstSeenAt: u.firstSeenAt,
        lastSeenAt: u.lastSeenAt,
        messagesHeld: u.messagesHeld,
      })),
      basis: basis(
        'unmatched_id_count',
        `${plural(t.unmatched.length, 'BMS ID')} with ${held.toLocaleString('en-GB')} messages held.`,
        held ? ['Held data is in no figure on this page until the ID is linked to a battery.'] : [],
      ),
    },
    warnings: {
      bySeverity,
      open: warnings,
      basis: basis(
        'open_warnings_by_severity',
        `${plural(s.rules.length, 'rule')} (example settings) run over the latest calculations for ${plural(N, 'battery', 'batteries')}.`,
        [...neverNote, 'The health-trend rule is not active: its method is not confirmed yet.'],
      ),
    },
    updated: t.freshness,
    asOf: new Date().toISOString(),
  };
}

function batteryRows(t: Tenant): BatteryRow[] {
  const warnings = openWarnings(t);
  return t.batteries.map((b) => {
    const mine = warnings.filter((w) => w.battery.batteryId === b.id);
    return {
      battery: ref(b),
      model: b.birth?.model ?? null,
      holder: b.deployment?.holder ?? null,
      site: b.deployment?.site ?? null,
      sohReportedPct: b.reported.sohPct,
      cyclesReported: b.reported.cycles,
      coveragePct: pct(b.calc.received, b.calc.expected),
      lastSeenAt: b.calc.lastSeenAt,
      openWarnings: mine.length,
      worstSeverity: mine[0]?.severity ?? null,
      hasBirthRecord: b.birth !== null,
    };
  });
}

const BATTERY_SORTS = ['serial', 'soh', 'cycles', 'coverage', 'lastSeen', 'warnings'] as const;

// ---------------------------------------------------------------- routes

function meFor(u: DemoUser): DemoMe {
  const m = MANUFACTURERS.find((x) => x.id === u.manufacturerId)!;
  return {
    user: { id: u.id, name: u.name, role: u.role },
    manufacturer: { id: m.id, name: m.name },
    permissions: DEMO_POLICY[u.role],
    asOf: new Date().toISOString(),
  };
}

function route(method: string, path: string, body: unknown): Response {
  const url = new URL(path, 'http://demo.invalid');
  const p = url.pathname;
  const user = readUser();

  if (method === 'POST' && p === '/auth/mock-login') {
    const id = (body as { userId?: unknown } | null)?.userId;
    const u = USERS.find((x) => x.id === id);
    if (!u) return fail(401, 'unauthenticated', 'Unknown demo user');
    writeUser(u.id);
    return reply(200, { ok: true });
  }
  if (method === 'POST' && p === '/auth/logout') {
    writeUser(null);
    return reply(204);
  }
  if (!user) return fail(401, 'unauthenticated', 'Sign in required');
  if (method === 'GET' && p === '/me') return reply(200, meFor(user));

  const need = (permission: DemoPermission) =>
    DEMO_POLICY[user.role].includes(permission) ? null : fail(403, 'forbidden', 'Missing permission');
  // The tenant is the signed-in user's manufacturer. Nothing in the path, query or body can change it.
  const tenant = world().get(user.manufacturerId)!;

  if (method === 'GET' && p === '/metrics') {
    return need('fleet.view') ?? reply(200, { items: METRICS, asOf: new Date().toISOString() });
  }

  if (method === 'GET' && p === '/fleet/overview') {
    return need('fleet.view') ?? reply(200, overview(tenant));
  }

  if (method === 'GET' && p === '/batteries') {
    const denied = need('batteries.view');
    if (denied) return denied;
    const page = intParam(url, 'page', 1, 1, 100_000);
    const size = intParam(url, 'pageSize', 25, 1, 100);
    const [field, dir = 'asc', extra] = (url.searchParams.get('sort') ?? 'serial:asc').split(':');
    const sortField = BATTERY_SORTS.find((f) => f === field);
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    if (page === null || size === null || !sortField || extra !== undefined || (dir !== 'asc' && dir !== 'desc') || q.length > 100)
      return fail(400, 'validation_failed', 'The request is invalid');
    const key = (r: BatteryRow): string | number | null =>
      ({
        serial: r.battery.factorySerial,
        soh: r.sohReportedPct,
        cycles: r.cyclesReported,
        coverage: r.coveragePct,
        lastSeen: r.lastSeenAt,
        warnings: r.openWarnings ? r.openWarnings * 10 + (2 - SEVERITY_RANK[r.worstSeverity!]) : 0,
      })[sortField];
    const sign = dir === 'asc' ? 1 : -1;
    const rows = batteryRows(tenant)
      .filter(
        (r) =>
          !q ||
          [r.battery.factorySerial, r.battery.bmsId, r.holder, r.site, r.model].some((v) =>
            (v ?? '').toLowerCase().includes(q),
          ),
      )
      .sort((a, b) => {
        const x = key(a);
        const y = key(b);
        const tie = (a.battery.factorySerial ?? '').localeCompare(b.battery.factorySerial ?? '');
        if (x === null && y === null) return tie;
        if (x === null) return 1; // "not recorded" always last
        if (y === null) return -1;
        return x === y ? tie : (x < y ? -1 : 1) * sign;
      });
    return reply(200, {
      items: rows.slice((page - 1) * size, page * size),
      total: rows.length,
      page,
      pageSize: size,
      asOf: new Date().toISOString(),
    });
  }

  return fail(404, 'not_found', 'Not found');
}

/** The demo's version of `fetch(`/api/v1${path}`)`. */
export async function demoRequest(method: string, path: string, body: unknown): Promise<Response> {
  await new Promise((r) => setTimeout(r, latencyMs));
  return route(method, path, body);
}
