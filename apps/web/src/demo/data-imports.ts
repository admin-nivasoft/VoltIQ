// Sample files and import history for the factory data import screens (VITE_DEMO=true). Fictional and
// deterministic. The sample files are built from the manufacturer's batteries in data.ts, so they
// match by construction.
import type { DemoManufacturer } from './data';
import { BATTERY_COUNT, USERS, buildBatteries, buildUnmatched } from './data';
import type { BuildImportHistory, BuildSampleFiles, ImportHistoryEntry, SampleFile } from './data-shapes';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SUPPLIER_ODD = 'Northfield Cell Works';
const SUPPLIER_EVEN = 'Tarn Electrode Co';

const iso = (t: number) => new Date(t).toISOString();
const isoDate = (t: number) => iso(t).slice(0, 10);
const pad = (n: number, w: number) => String(n).padStart(w, '0');

/** A fixed pseudo-random number in [0, 1) from a string, so every load shows the same data. */
function h(seed: string): number {
  let x = 2166136261;
  for (let i = 0; i < seed.length; i++) x = Math.imul(x ^ seed.charCodeAt(i), 16777619);
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}
const hex = (seed: string) => Math.floor(h(seed) * 0xffffff).toString(16).toUpperCase().padStart(6, '0');

/** Factory serials look like LRB-2026-00007: manufacturer code, year, battery number. */
function parseSerial(serial: string): { code: string; n: number } {
  const [code = '', , num = '0'] = serial.split('-');
  return { code, n: Number(num) };
}

/** Same lot ids and pairing as data-battery.ts: each battery uses two lots from one supplier. */
const lotId = (code: string, k: number) => `${code}-L${pad(k, 2)}`;
function lotNumbers(n: number): [number, number] {
  const p = Math.floor(n / 2) % 3;
  return n % 2 === 0 ? [2 * p + 1, 2 * p + 3] : [2 * p + 2, 2 * p + 4];
}

const BIRTH_HEADER = [
  'factory_serial',
  'bms_id',
  'build_date',
  'line',
  'model',
  'chemistry',
  'rated_capacity_ah',
  'firmware',
  'shift',
  'cell_supplier',
  'cell_lots',
  'grade_spread',
  'eol_result',
  'eol_date',
  'enclosure_rev', // not a known column: stored, not dropped
].join(',');

function birthRow(code: string, n: number, serial: string, bms: string, buildDate: string, eolDate: string): string {
  const [a, c] = lotNumbers(n);
  return [
    serial,
    bms,
    buildDate,
    `Line ${1 + (n % 2)}`,
    'LR-48V-105Ah',
    'LFP',
    105,
    `2.4.${n % 7}`,
    n % 2 === 0 ? 'A' : 'B',
    n % 2 === 0 ? SUPPLIER_ODD : SUPPLIER_EVEN,
    `${lotId(code, a)};${lotId(code, c)}`,
    'A1–A3',
    'pass',
    eolDate,
    'R2',
  ].join(',');
}

export const buildSampleFiles: BuildSampleFiles = (m, batteries, now) => {
  const code = m.code;
  const year = new Date(now).getUTCFullYear();
  const build = isoDate(now - 150 * DAY);
  const eol = isoDate(now - 148 * DAY);
  const newSerial = (n: number) => `${code}-${year}-${pad(n, 5)}`;
  const freshBms = (k: number) => `BMS-${hex(`new${code}${k}`)}`;
  const unmatchedId = buildUnmatched(m, now)[0]?.idValue ?? '';
  const firstBms = batteries[0]?.bmsId ?? '';

  // Admin-entered batteries without a factory record come first; they get matched.
  const adminEntered = batteries.filter((b) => b.birth === null);
  const birthRows = [
    ...adminEntered.map((b) => birthRow(code, parseSerial(b.factorySerial).n, b.factorySerial, b.bmsId, build, eol)),
    birthRow(code, 201, newSerial(201), unmatchedId, build, eol), // new battery, resolves the unmatched BMS id
    birthRow(code, 202, newSerial(202), firstBms, build, eol), // BMS id already belongs to another battery: conflict
    birthRow(code, 203, newSerial(203), freshBms(203), '2026-13-45', eol), // bad date: rejected
    birthRow(code, 204, '', freshBms(204), build, eol), // no factory serial: rejected
    birthRow(code, 205, newSerial(205), freshBms(205), build, eol), // new battery
  ];

  const tests = batteries
    .filter((b) => b.birth !== null)
    .slice(0, 6)
    .flatMap((b) => {
      const birth = b.birth;
      if (!birth || birth.ratedCapacityAh === null) return [];
      const at = `${isoDate(Date.parse(birth.buildDate) + DAY)}T09:00:00Z`;
      const capacity = Math.round(birth.ratedCapacityAh * (0.97 + h(`cap${b.id}`) * 0.06) * 10) / 10;
      const ir = Math.round(18 + h(`ir${b.id}`) * 12);
      return [
        `${b.factorySerial},capacity_check,${at},${capacity},Ah`,
        `${b.factorySerial},ir_check,${at},${ir},mOhm`,
      ];
    });

  const lots = Array.from({ length: 8 }, (_, i) => {
    const k = i + 1;
    const supplier = k % 2 === 1 ? SUPPLIER_ODD : SUPPLIER_EVEN;
    return `${lotId(code, k)},${supplier},${isoDate(now - (60 + k * 5) * DAY)},${1200 + 40 * k}`;
  });

  const dispatches = batteries.flatMap((b) =>
    b.deployment ? [`${b.factorySerial},${b.deployment.holder},${b.deployment.site},${b.deployment.since}`] : [],
  );

  const files: SampleFile[] = [
    {
      fileName: 'birth-records-sample.csv',
      kind: 'birth',
      description: 'Factory records for new batteries and for the Admin-entered batteries that have no factory record yet.',
      csv: [BIRTH_HEADER, ...birthRows].join('\n'),
    },
    {
      fileName: 'factory-tests-sample.csv',
      kind: 'test',
      description: 'Factory test results for the first six batteries with a factory record.',
      csv: ['factory_serial,test_name,measured_at,value,unit', ...tests].join('\n'),
    },
    {
      fileName: 'cell-lots-sample.csv',
      kind: 'lot',
      description: 'Cell lots received, with the supplier for each lot.',
      csv: ['lot_id,cell_supplier,received_on,cells_received', ...lots].join('\n'),
    },
    {
      fileName: 'dispatch-sample.csv',
      kind: 'dispatch',
      description: 'Which holder and site each battery was dispatched to.',
      csv: ['factory_serial,holder,site,dispatched_on', ...dispatches].join('\n'),
    },
  ];
  return files;
};

export const buildImportHistory: BuildImportHistory = (m: DemoManufacturer, now) => {
  const batteries = buildBatteries(m, now, BATTERY_COUNT[m.id] ?? 0);
  const files = buildSampleFiles(m, batteries, now);
  const rowsOf = (kind: SampleFile['kind']) => {
    const csv = files.find((f) => f.kind === kind)?.csv ?? '';
    return csv.split('\n').length - 1;
  };
  // Birth rows: admin-entered rows and two new batteries load; one conflict is unmatched; two are rejected.
  const adminCount = batteries.filter((b) => b.birth === null).length;
  const by =
    USERS.find((u) => u.manufacturerId === m.id && u.role === 'admin') ??
    USERS.find((u) => u.manufacturerId === m.id);
  const byName = by?.name ?? '[__]';
  const p = m.id.charAt(0);
  const importId = (k: number) => `${p}5000000-0000-4000-9000-${pad(k, 12)}`;

  const entries: ImportHistoryEntry[] = [
    {
      importId: importId(1),
      fileName: 'birth-records-sample.csv',
      kind: 'birth',
      by: byName,
      at: iso(now - 2 * DAY - 5 * HOUR - 48 * 60_000),
      rowsLoaded: adminCount + 2,
      rowsRejected: 2,
      rowsUnmatched: 1,
      unknownColumns: ['enclosure_rev'],
    },
    {
      importId: importId(2),
      fileName: 'factory-tests-sample.csv',
      kind: 'test',
      by: byName,
      at: iso(now - 9 * DAY),
      rowsLoaded: rowsOf('test'),
      rowsRejected: 0,
      rowsUnmatched: 0,
      unknownColumns: [],
    },
    {
      importId: importId(3),
      fileName: 'cell-lots-sample.csv',
      kind: 'lot',
      by: byName,
      at: iso(now - 14 * DAY),
      rowsLoaded: rowsOf('lot'),
      rowsRejected: 0,
      rowsUnmatched: 0,
      unknownColumns: [],
    },
    {
      importId: importId(4),
      fileName: 'dispatch-sample.csv',
      kind: 'dispatch',
      by: byName,
      at: iso(now - 20 * DAY),
      rowsLoaded: rowsOf('dispatch'),
      rowsRejected: 0,
      rowsUnmatched: 0,
      unknownColumns: [],
    },
  ];
  return entries;
};
