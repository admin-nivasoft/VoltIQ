// Sample data for the in-browser demo (VITE_DEMO=true). Entirely made up: fictional manufacturers,
// people, customers and battery management system, deterministic values, no connection to any real
// fleet. This module is only ever imported by the demo handler, which is only imported when the demo
// flag is set at build time.
//
// The fleet includes the awkward cases on purpose, so the demo stays honest:
// - two batteries an Admin entered with no birth record (LRB-…-00007, -00031)
// - one battery with a long gap in its BMS data (-00012) and one that has gone quiet (-00044)
// - one battery registered but never deployed or heard from (-00046)
// - two BMS IDs that match no registered battery
// - warnings produced by running the example rules over the values below
import type { DemoRole, Settings } from './types';

export interface DemoManufacturer {
  id: string;
  name: string;
  code: string;
  /** Shown in the sign-in picker. The second manufacturer exists only to prove tenant separation. */
  inPicker: boolean;
}
export interface DemoUser {
  id: string;
  name: string;
  role: DemoRole;
  manufacturerId: string;
}

/** Null means the factory file did not include it: shown as "Not recorded", never stored as text. */
export interface BirthRecord {
  buildDate: string; // ISO date
  line: string | null;
  model: string | null;
  chemistry: string | null;
  ratedCapacityAh: number | null;
  firmware: string | null;
}
export interface DemoBattery {
  id: string;
  manufacturerId: string;
  factorySerial: string;
  bmsId: string;
  birth: BirthRecord | null;
  deployment: { holder: string; site: string; since: string } | null;
  /** As reported by the BMS (silver). Null means the BMS has not reported it. */
  reported: { sohPct: number | null; cycles: number | null; socPct: number | null };
  /** Calculated from BMS readings (gold), over the coverage period unless noted. */
  calc: {
    maxTempC: number | null;
    spreadMv: number | null;
    received: number;
    expected: number;
    longestGapHours: number;
    lastSeenAt: string | null;
  };
}
export interface DemoUnmatched {
  id: string;
  manufacturerId: string;
  idValue: string;
  firstSeenAt: string;
  lastSeenAt: string;
  messagesHeld: number;
}

export const MANUFACTURERS: DemoManufacturer[] = [
  { id: 'a1000000-0000-4000-8000-000000000001', name: 'Lumen Ridge Batteries', code: 'LRB', inPicker: true },
  { id: 'b2000000-0000-4000-8000-000000000002', name: 'Corvane Power Cells', code: 'CPC', inPicker: false },
];
const [LRB, CPC] = MANUFACTURERS as [DemoManufacturer, DemoManufacturer];

export const USERS: DemoUser[] = [
  { id: 'a1000000-0000-4000-8000-0000000000b1', name: 'Ananya Desai', role: 'battery_manager', manufacturerId: LRB.id },
  { id: 'a1000000-0000-4000-8000-0000000000a1', name: 'Rohan Mehta', role: 'admin', manufacturerId: LRB.id },
  { id: 'b2000000-0000-4000-8000-0000000000b1', name: 'Ines Varga', role: 'battery_manager', manufacturerId: CPC.id },
  { id: 'b2000000-0000-4000-8000-0000000000a1', name: 'Tomas Lindqvist', role: 'admin', manufacturerId: CPC.id },
];

/**
 * This fictional manufacturer's settings. Round, illustrative numbers chosen for the demo: not
 * engineering recommendations and not product defaults (bpte/data-model/metrics.md leaves them [__]).
 */
export const EXAMPLE_SETTINGS: Settings = {
  reportingWindowHours: 24,
  sendIntervalMinutes: 15,
  coveragePeriodDays: 7,
  gapCoverageBelowPct: 90,
  gapLongerThanHours: 2,
  healthBandPct: 2,
  cycleBand: 100,
  rules: [
    { ruleId: 'high_temp', version: 1, metricId: 'max_temp_c', condition: 'Temperature above 55 °C', severity: 'high' },
    { ruleId: 'cell_imbalance', version: 1, metricId: 'cell_voltage_spread_mv', condition: 'Cell spread above 100 mV', severity: 'medium' },
    { ruleId: 'no_data', version: 1, metricId: 'last_seen_at', condition: 'No data for 48 hours', severity: 'medium' },
    { ruleId: 'soh_low', version: 1, metricId: 'soh_reported_pct', condition: 'Health (reported by BMS) below 80%', severity: 'low' },
  ],
};
export const RULE_LIMITS = { tempC: 55, spreadMv: 100, noDataHours: 48, sohPct: 80 } as const;

/** A fixed pseudo-random number in [0, 1) from a string, so every load shows the same fleet. */
function h(seed: string): number {
  let x = 2166136261;
  for (let i = 0; i < seed.length; i++) x = Math.imul(x ^ seed.charCodeAt(i), 16777619);
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const pad = (n: number, w: number) => String(n).padStart(w, '0');
const hex = (seed: string) => Math.floor(h(seed) * 0xffffff).toString(16).toUpperCase().padStart(6, '0');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (t: number) => new Date(t).toISOString();
const isoDate = (t: number) => iso(t).slice(0, 10);

const MODELS = [
  { model: 'LR-48V-105Ah', chemistry: 'LFP', ratedCapacityAh: 105 },
  { model: 'LR-51V-280Ah', chemistry: 'LFP', ratedCapacityAh: 280 },
  { model: 'LR-72V-60Ah', chemistry: 'NMC', ratedCapacityAh: 60 },
] as const;
const HOLDERS = [
  { holder: 'Aster Freight', sites: ['Pune depot', 'Nashik depot'] },
  { holder: 'Bluefin Storage', sites: ['Hosur site 2'] },
  { holder: 'Harbor Lane Mobility', sites: ['Chennai yard', 'Coimbatore yard'] },
] as const;

/** Per-battery special cases for Lumen Ridge (by battery number). */
const NO_BIRTH = new Set([7, 31]);
const GAP = 12;
const QUIET = 44;
const NEVER = 46;
const OVERRIDE: Record<number, Partial<{ soh: number; temp: number; spread: number }>> = {
  3: { temp: 58.4 },
  19: { spread: 128 },
  27: { soh: 78.6 },
  38: { soh: 79.2 },
};

export function buildBatteries(m: DemoManufacturer, now: number, count: number): DemoBattery[] {
  const perDay = (24 * 60) / EXAMPLE_SETTINGS.sendIntervalMinutes;
  const periodExpected = EXAMPLE_SETTINGS.coveragePeriodDays * perDay;
  const prefix = m.code;
  return Array.from({ length: count }, (_, k) => {
    const n = k + 1;
    const s = `${prefix}${n}`;
    const spec = MODELS[n % 3]!;
    const ageDays = 120 + Math.floor(h(`age${s}`) * 700);
    const built = now - ageDays * DAY;
    const isLrb = m.id === LRB.id;
    const noBirth = isLrb && NO_BIRTH.has(n);
    const never = isLrb && n === NEVER;
    const o = (isLrb && OVERRIDE[n]) || {};
    const holderSpec = HOLDERS[n % 3]!;
    const deployedAt = built + (20 + Math.floor(h(`dep${s}`) * 25)) * DAY;
    const cycles = never ? null : Math.round((ageDays - 30) * (0.55 + 0.5 * h(`cyc${s}`)));
    const soh = never
      ? null
      : (o.soh ?? round(Math.min(99.6, 100.4 - (cycles ?? 0) * 0.011 - h(`soh${s}`) * 3), 1));

    let received = periodExpected - Math.floor(h(`miss${s}`) * 7);
    let longestGapHours = round(0.25 + Math.floor(h(`gap${s}`) * 3) * 0.25, 2);
    let lastSeenAt: number | null = now - Math.floor(2 + h(`seen${s}`) * 12) * 60_000;
    if (isLrb && n === GAP) {
      received = Math.round(periodExpected * 0.711);
      longestGapHours = 31;
    }
    if (isLrb && n === QUIET) {
      const silentHours = 74;
      lastSeenAt = now - silentHours * HOUR;
      received = Math.round((EXAMPLE_SETTINGS.coveragePeriodDays * 24 - silentHours) * (perDay / 24)) - 3;
      longestGapHours = silentHours;
    }
    if (never) {
      received = 0;
      lastSeenAt = null;
      longestGapHours = 0;
    }

    return {
      id: `${isLrb ? 'a' : 'b'}3000000-0000-4000-9000-${pad(n, 12)}`,
      manufacturerId: m.id,
      factorySerial: `${prefix}-${new Date(built).getUTCFullYear()}-${pad(n, 5)}`,
      bmsId: `BMS-${hex(`bms${s}`)}`,
      birth: noBirth
        ? null
        : {
            buildDate: isoDate(built),
            line: `Line ${1 + (n % 2)}`,
            model: spec.model,
            chemistry: spec.chemistry,
            ratedCapacityAh: spec.ratedCapacityAh,
            firmware: `2.${3 + (n % 3)}.${n % 7}`,
          },
      deployment: never
        ? null
        : {
            holder: holderSpec.holder,
            site: holderSpec.sites[n % holderSpec.sites.length]!,
            since: isoDate(deployedAt),
          },
      reported: {
        sohPct: soh,
        cycles,
        socPct: never ? null : Math.round(22 + h(`soc${s}`) * 72),
      },
      calc: {
        maxTempC: never ? null : (o.temp ?? round(31 + h(`tmp${s}`) * 14, 1)),
        spreadMv: never ? null : (o.spread ?? Math.round(14 + h(`spr${s}`) * 32)),
        received,
        expected: never ? 0 : periodExpected,
        longestGapHours,
        lastSeenAt: lastSeenAt === null ? null : iso(lastSeenAt),
      },
    };
  });
}

export function buildUnmatched(m: DemoManufacturer, now: number): DemoUnmatched[] {
  if (m.id !== LRB.id) {
    return [
      {
        id: 'b4000000-0000-4000-9000-000000000001',
        manufacturerId: m.id,
        idValue: 'BMS-CPC-ORPHAN',
        firstSeenAt: iso(now - 2 * DAY),
        lastSeenAt: iso(now - HOUR),
        messagesHeld: 180,
      },
    ];
  }
  return [
    {
      id: 'a4000000-0000-4000-9000-000000000001',
      manufacturerId: m.id,
      idValue: 'BMS-7F3A9C',
      firstSeenAt: iso(now - 5 * DAY - 3 * HOUR),
      lastSeenAt: iso(now - 9 * 60_000),
      messagesHeld: 488,
    },
    {
      id: 'a4000000-0000-4000-9000-000000000002',
      manufacturerId: m.id,
      idValue: 'BMS-0B21D4',
      firstSeenAt: iso(now - 9 * HOUR),
      lastSeenAt: iso(now - 4 * 60_000),
      messagesHeld: 36,
    },
  ];
}

/** When each data source last changed, for the "last updated" labels. */
export function buildFreshness(now: number) {
  return {
    registry: iso(now - 2 * DAY - 5 * HOUR - 48 * 60_000), // last birth data import
    bms: iso(now - 2 * 60_000), // most recent BMS message received
    calculations: iso(now - 11 * 60_000), // last gold calculation run
  };
}

export const BATTERY_COUNT: Record<string, number> = { [LRB.id]: 48, [CPC.id]: 12 };
