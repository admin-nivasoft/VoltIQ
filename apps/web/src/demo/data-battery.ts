// Sample detail data for the battery screen (VITE_DEMO=true). Fictional and deterministic: values come
// from the battery's own fields in data.ts or a fixed hash of its id; times are relative to `now`.
// Follows the consistency rules in data-shapes.ts.
import type { DemoBattery } from './data';
import type {
  BatteryIdentifier,
  BirthExtras,
  BuildBatteryDetail,
  CellRecord,
  CellVoltageReading,
  DailyCoverage,
  DeploymentEntry,
  GapInterval,
  SohPoint,
} from './data-shapes';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CELLS = 16; // 4 modules x 4 slots
const SUPPLIER_ODD = 'Northfield Cell Works';
const SUPPLIER_EVEN = 'Tarn Electrode Co';
const PRIOR_HOLDER = 'Kestrel Transit';
const PRIOR_SITE = 'Salem hub';

const iso = (t: number) => new Date(t).toISOString();
const isoDate = (t: number) => iso(t).slice(0, 10);
const pad = (n: number, w: number) => String(n).padStart(w, '0');
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/** A fixed pseudo-random number in [0, 1) from a string, so every load shows the same data. */
function h(seed: string): number {
  let x = 2166136261;
  for (let i = 0; i < seed.length; i++) x = Math.imul(x ^ seed.charCodeAt(i), 16777619);
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

/** Splits a total into whole parts by weight; the last part takes the rounding remainder. */
function split(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, w) => a + w, 0);
  const parts = weights.map((w) => Math.floor((total * w) / sum));
  const rest = total - parts.reduce((a, p) => a + p, 0);
  parts[parts.length - 1] = (parts[parts.length - 1] ?? 0) + rest;
  return parts;
}

/** Factory serials look like LRB-2026-00007: manufacturer code, year, battery number. */
function parseSerial(serial: string): { code: string; n: number } {
  const [code = '', , num = '0'] = serial.split('-');
  return { code, n: Number(num) };
}

/** Lot ids are LRB-L01 etc. Odd lots come from the odd supplier, even lots from the even one. */
const lotId = (code: string, k: number) => `${code}-L${pad(k, 2)}`;

/** Each battery uses two lots from one supplier: even batteries odd lots, odd batteries even lots. */
function lotNumbers(n: number): [number, number] {
  const p = Math.floor(n / 2) % 3;
  return n % 2 === 0 ? [2 * p + 1, 2 * p + 3] : [2 * p + 2, 2 * p + 4];
}

function birthExtrasFor(b: DemoBattery, code: string, n: number): BirthExtras | null {
  const birth = b.birth;
  if (!birth) return null;
  const [a, c] = lotNumbers(n);
  return {
    shift: h(`shift${b.id}`) < 0.5 ? 'A' : 'B',
    cellSupplier: n % 2 === 0 ? SUPPLIER_ODD : SUPPLIER_EVEN,
    cellLots: [lotId(code, a), lotId(code, c)],
    gradeSpread: n % 2 === 0 ? 'A1–A3' : 'A1–A2',
    eolResult: 'pass',
    eolDate: isoDate(Date.parse(birth.buildDate) + 2 * DAY),
    firmwareAtBuild: birth.firmware,
  };
}

function cellsFor(b: DemoBattery, code: string, n: number): CellRecord[] {
  const birth = b.birth;
  if (!birth) return [];
  const cap = birth.ratedCapacityAh;
  const [a, c] = lotNumbers(n);
  const lotA = lotId(code, a);
  const lotB = lotId(code, c);
  return Array.from({ length: CELLS }, (_, i) => {
    const key = `${b.id}-${i}`;
    const grades = ['A1', 'A2', 'A3'];
    return {
      cellSerial: `${b.factorySerial}-C${pad(i + 1, 2)}`,
      module: Math.floor(i / 4) + 1,
      slot: (i % 4) + 1,
      lotId: i % 2 === 0 ? lotA : lotB,
      ocvV: h(`ocv${key}`) < 0.04 ? null : round(3.25 + h(`ocvv${key}`) * 0.12, 3),
      irMilliohm: h(`ir${key}`) < 0.04 ? null : Math.round(18 + h(`irv${key}`) * 12),
      capacityAh: cap === null ? null : round(cap * (0.97 + h(`cap${key}`) * 0.06)),
      grade: grades[Math.floor(h(`gr${key}`) * 3)] ?? null,
    };
  });
}

/** Eight points, two weeks apart, ending at the reported value. Health only falls, so earlier points are higher. */
function sohHistoryFor(b: DemoBattery, now: number): SohPoint[] {
  const end = b.reported.sohPct;
  if (end === null) return [];
  const extra = 0.6 + h(`sohx${b.id}`) * 2;
  return Array.from({ length: 8 }, (_, i) => ({
    observedAt: iso(now - (7 - i) * 14 * DAY),
    sohPct: i === 7 ? end : Math.min(100, round(end + extra * (1 - i / 7))),
  }));
}

/** Min is the base value and max is base + spreadMv, so the spread equals calc.spreadMv exactly. */
function cellVoltagesFor(b: DemoBattery): CellVoltageReading | null {
  const observedAt = b.calc.lastSeenAt;
  if (observedAt === null) return null;
  const spread = b.calc.spreadMv ?? 0;
  const base = 3280 + Math.floor(h(`cvb${b.id}`) * 40);
  const cells = Array.from({ length: CELLS }, (_, i) => {
    const off = i === 0 ? 0 : i === CELLS - 1 ? spread : Math.round(h(`cvo${b.id}-${i}`) * spread);
    return { module: Math.floor(i / 4) + 1, slot: (i % 4) + 1, mv: base + off };
  });
  return { observedAt, cells };
}

/**
 * Seven days ending today. Received and expected sum exactly to calc.received and calc.expected, and
 * no day ever receives more than it expected (duplicates count once). Missing messages land where
 * the silence is: on the last days for a battery that went quiet, on consecutive days for one long
 * gap, and one at a time across the week otherwise.
 */
function coverageFor(b: DemoBattery, now: number): DailyCoverage[] {
  const days = Array.from({ length: 7 }, (_, i) => isoDate(now - (6 - i) * DAY));
  const exp = split(
    b.calc.expected,
    days.map(() => 1),
  ).map((v) => v ?? 0);
  const miss = days.map(() => 0);
  let left = Math.max(0, b.calc.expected - b.calc.received);
  const take = (i: number, most = left) => {
    const n = Math.min(left, most, exp[i]! - miss[i]!);
    miss[i]! += n;
    left -= n;
  };
  const silentNow = b.calc.lastSeenAt !== null && now - Date.parse(b.calc.lastSeenAt) > 2 * 3_600_000;
  if (silentNow) for (let i = 6; i >= 0 && left > 0; i--) take(i);
  else if (b.calc.longestGapHours > 2) for (let i = 2; i < 7 && left > 0; i++) take(i);
  for (let round = 0; left > 0 && round < 1000; round++) take(Math.floor(h(`cov${b.id}${round}`) * 7), 1);
  return days.map((day, i) => ({ day, received: exp[i]! - miss[i]!, expected: exp[i]! }));
}

/** Only silences over 2 h are listed. The longest one equals calc.longestGapHours. */
function gapsFor(b: DemoBattery, now: number): GapInterval[] {
  const hours = b.calc.longestGapHours;
  if (hours <= 2) return [];
  const last = b.calc.lastSeenAt === null ? null : Date.parse(b.calc.lastSeenAt);
  // Still silent: the gap runs to now. Otherwise it ended when data came back.
  const end = last !== null && now - last >= hours * HOUR - 60_000 ? now : (last ?? now);
  return [{ from: iso(end - hours * HOUR), to: iso(end), hours }];
}

export const buildBatteryDetail: BuildBatteryDetail = (b, now) => {
  const { code, n } = parseSerial(b.factorySerial);
  const birth = b.birth;

  const deployments: DeploymentEntry[] = [];
  if (b.deployment) {
    deployments.push({ holder: b.deployment.holder, site: b.deployment.site, from: b.deployment.since, to: null });
    if (birth) {
      deployments.push({ holder: PRIOR_HOLDER, site: PRIOR_SITE, from: birth.buildDate, to: b.deployment.since });
    }
  }

  const linkedAt = birth ? `${birth.buildDate}T00:00:00.000Z` : iso(now - 30 * DAY);
  const source = birth ? 'birth_record' : 'admin_entry';
  const identifiers: BatteryIdentifier[] = [
    { idType: 'factory_serial', value: b.factorySerial, source, linkedAt },
    { idType: 'bms_id', value: b.bmsId, source, linkedAt },
  ];

  return {
    batteryId: b.id,
    birthExtras: birthExtrasFor(b, code, n),
    cells: cellsFor(b, code, n),
    deployments,
    sohHistory: sohHistoryFor(b, now),
    cellVoltages: cellVoltagesFor(b),
    dailyCoverage: coverageFor(b, now),
    gaps: gapsFor(b, now),
    identifiers,
    faultCount30d: b.calc.lastSeenAt === null ? null : Math.floor(h(`flt${b.id}`) * 5),
  };
};
