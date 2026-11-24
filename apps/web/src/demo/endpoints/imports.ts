// Endpoints for the factory data import screen (SCR-06). Everything stays in the browser and in this
// session: a preview checks a file without changing anything, an import changes the tenant's batteries
// and unmatched IDs. Matching is exact only (bpte/data-model/id-matching.md); there is no fuzzy matching.
import type { BirthRecord, DemoBattery } from '../data';
import { buildImportHistory, buildSampleFiles } from '../data-imports';
import type { ImportHistoryEntry, SampleFile } from '../data-shapes';
import type { Basis } from '../types';
import {
  ImportBodySchema,
  type ImportKind,
  type ImportPreview,
  type ImportRow,
} from '../types-imports';
import type { Tenant } from '../world';
import { fail, reply, type RouteModule } from './context';

// ---------------------------------------------------------------- per-session state

interface ImportState {
  files: SampleFile[];
  base: ImportHistoryEntry[];
  session: ImportHistoryEntry[];
}
/** Keyed by the Tenant object, so resetting the demo world also forgets this session's imports. */
const states = new WeakMap<Tenant, ImportState>();

function stateOf(t: Tenant): ImportState {
  let s = states.get(t);
  if (!s) {
    // Built before anything is imported, so the sample files always describe the starting data.
    s = {
      files: buildSampleFiles(t.manufacturer, t.batteries, t.now),
      base: buildImportHistory(t.manufacturer, t.now),
      session: [],
    };
    states.set(t, s);
  }
  return s;
}

// ---------------------------------------------------------------- CSV and checks

/** Comma separated, with double quotes allowed around a value. Blank lines are skipped. */
function parseCsv(text: string): { header: string[]; rows: { line: number; cells: string[] }[] } {
  const lines = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r\n|\n|\r/);
  const split = (l: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i]!;
      if (quoted) {
        if (c === '"' && l[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') quoted = false;
        else cur += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') {
        out.push(cur.trim());
        cur = '';
      } else cur += c;
    }
    out.push(cur.trim());
    return out;
  };
  const header = split(lines[0] ?? '').map((h) => h.toLowerCase());
  const rows = lines
    .slice(1)
    .map((l, i) => ({ line: i + 2, text: l }))
    .filter((r) => r.text.trim() !== '')
    .map((r) => ({ line: r.line, cells: split(r.text) }));
  return { header, rows };
}

const isDate = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
};
const isTimestamp = (v: string) => /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v));

const KNOWN: Record<ImportKind, string[]> = {
  birth: [
    'factory_serial', 'bms_id', 'build_date', 'line', 'model', 'chemistry', 'rated_capacity_ah', 'firmware',
    'shift', 'cell_supplier', 'cell_lots', 'grade_spread', 'eol_result', 'eol_date',
  ],
  test: ['factory_serial', 'test_name', 'measured_at', 'value', 'unit'],
  lot: ['lot_id', 'cell_supplier', 'received_on', 'cells_received'],
  dispatch: ['factory_serial', 'holder', 'site', 'dispatched_on'],
};

function detectKind(header: string[]): ImportKind | null {
  if (header.includes('lot_id')) return 'lot';
  if (header.includes('test_name')) return 'test';
  if (header.includes('holder')) return 'dispatch';
  if (header.includes('factory_serial')) return 'birth';
  return null;
}

// ---------------------------------------------------------------- evaluating a file

type Action =
  | { type: 'give_birth'; battery: DemoBattery; birth: BirthRecord; resolveBms: string | null }
  | { type: 'create'; serial: string; bmsId: string; birth: BirthRecord; resolveBms: string | null };

interface Evaluation {
  kind: ImportKind;
  rows: ImportRow[];
  actions: Action[];
  unknownColumns: string[];
}

function evaluate(t: Tenant, csv: string): Evaluation | { error: string } {
  const { header, rows } = parseCsv(csv);
  const kind = detectKind(header);
  if (!kind) {
    return { error: 'The first line must name the columns. Use factory_serial for birth, test and dispatch files, or lot_id for a lot file.' };
  }
  const known = KNOWN[kind];
  const unknownColumns = header.filter((h) => h !== '' && !known.includes(h));
  const col = (cells: string[], name: string) => {
    const i = header.indexOf(name);
    return i < 0 ? '' : (cells[i] ?? '');
  };
  const required: Record<ImportKind, string[]> = {
    birth: ['factory_serial', 'build_date', 'model', 'rated_capacity_ah'],
    test: ['factory_serial', 'test_name', 'measured_at', 'value'],
    lot: ['lot_id', 'received_on', 'cells_received'],
    dispatch: ['factory_serial', 'holder', 'site', 'dispatched_on'],
  };
  const missingColumn = required[kind].find((c) => !header.includes(c));

  const out: ImportRow[] = [];
  const actions: Action[] = [];
  const reject = (line: number, key: string | null, reason: string) =>
    out.push({ line, key, status: 'rejected', reason, unmatchedReason: null, effect: null });
  const unmatched = (line: number, key: string | null, why: 'no_match' | 'several_matches', reason: string) =>
    out.push({ line, key, status: 'unmatched', reason, unmatchedReason: why, effect: null });
  const loaded = (line: number, key: string | null, effect: string) =>
    out.push({ line, key, status: 'loaded', reason: null, unmatchedReason: null, effect });

  const bySerial = (serial: string) => t.batteries.filter((b) => b.factorySerial === serial);
  const byBms = (bms: string) => t.batteries.filter((b) => b.bmsId === bms);
  const seenKeys = new Set<string>();
  const claimedBms = new Set<string>();

  for (const r of rows) {
    const key = (col(r.cells, kind === 'lot' ? 'lot_id' : 'factory_serial') || null);
    if (missingColumn) {
      reject(r.line, key, `The column ${missingColumn} is missing from the file`);
      continue;
    }
    const empty = required[kind].find((c) => col(r.cells, c) === '');
    if (empty) {
      reject(r.line, key, empty === 'factory_serial' ? 'Factory serial is missing' : `${empty} is empty`);
      continue;
    }
    if (kind === 'birth' && key && seenKeys.has(key)) {
      reject(r.line, key, `${key} appears twice in this file`);
      continue;
    }
    if (key) seenKeys.add(key);

    if (kind === 'lot') {
      const n = Number(col(r.cells, 'cells_received'));
      if (!isDate(col(r.cells, 'received_on'))) reject(r.line, key, 'received_on is not a real date (use YYYY-MM-DD)');
      else if (!Number.isInteger(n) || n < 0) reject(r.line, key, 'cells_received is not a whole number');
      else loaded(r.line, key, 'Kept with the file as received. No battery changes in this demo');
      continue;
    }

    const serial = col(r.cells, 'factory_serial');
    const matches = bySerial(serial);

    if (kind === 'test' || kind === 'dispatch') {
      const dateField = kind === 'test' ? 'measured_at' : 'dispatched_on';
      const okDate = kind === 'test' ? isTimestamp(col(r.cells, dateField)) : isDate(col(r.cells, dateField));
      if (!okDate) {
        reject(r.line, key, `${dateField} is not a real ${kind === 'test' ? 'date and time' : 'date'}`);
        continue;
      }
      if (kind === 'test' && Number.isNaN(Number(col(r.cells, 'value')))) {
        reject(r.line, key, 'value is not a number');
        continue;
      }
      if (matches.length === 0) unmatched(r.line, key, 'no_match', `No battery has factory serial ${serial}`);
      else if (matches.length > 1) unmatched(r.line, key, 'several_matches', `More than one battery has factory serial ${serial}`);
      else loaded(r.line, key, 'Kept with the file as received. No battery changes in this demo');
      continue;
    }

    // Birth rows.
    const capacity = Number(col(r.cells, 'rated_capacity_ah'));
    if (!isDate(col(r.cells, 'build_date'))) {
      reject(r.line, key, 'build_date is not a real date (use YYYY-MM-DD)');
      continue;
    }
    if (!(capacity > 0)) {
      reject(r.line, key, 'rated_capacity_ah is not a positive number');
      continue;
    }
    const birth: BirthRecord = {
      buildDate: col(r.cells, 'build_date'),
      line: col(r.cells, 'line') || null,
      model: col(r.cells, 'model'),
      chemistry: col(r.cells, 'chemistry') || null,
      ratedCapacityAh: capacity,
      firmware: col(r.cells, 'firmware') || null,
    };
    const bms = col(r.cells, 'bms_id');
    const owners = bms ? byBms(bms) : [];
    const pending = bms ? t.unmatched.find((u) => u.idValue === bms) : undefined;
    const taken = bms ? claimedBms.has(bms) : false;

    if (matches.length > 1) {
      unmatched(r.line, key, 'several_matches', `More than one battery has factory serial ${serial}`);
      continue;
    }
    const existing = matches[0];
    if (existing) {
      if (existing.birth) {
        reject(r.line, key, 'This battery already has a factory record. A correction needs an Admin to edit it');
        continue;
      }
      if (bms && bms !== existing.bmsId) {
        if (owners.length) unmatched(r.line, key, 'several_matches', `BMS ID ${bms} already belongs to another battery`);
        else if (pending && !taken) {
          claimedBms.add(bms);
          actions.push({ type: 'give_birth', battery: existing, birth, resolveBms: bms });
          loaded(r.line, key, `Factory record added; BMS ID ${bms} linked to this battery`);
        } else reject(r.line, key, `BMS ID ${bms} differs from the one on record for this battery`);
        continue;
      }
      actions.push({ type: 'give_birth', battery: existing, birth, resolveBms: null });
      loaded(r.line, key, 'Factory record added to an Admin-entered battery');
      continue;
    }

    // A serial no battery has: a new battery, unless its BMS ID is already taken.
    if (bms && (owners.length || taken)) {
      unmatched(r.line, key, 'several_matches', `BMS ID ${bms} already belongs to another battery`);
      continue;
    }
    if (bms) claimedBms.add(bms);
    actions.push({ type: 'create', serial, bmsId: bms, birth, resolveBms: pending ? bms : null });
    loaded(r.line, key, pending ? `New battery created; resolves unrecognised BMS ID ${bms}` : 'New battery created');
  }
  return { kind, rows: out, actions, unknownColumns };
}

// ---------------------------------------------------------------- responses

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

function previewOf(t: Tenant, fileName: string, ev: Evaluation, calculatedAt: string): ImportPreview {
  const count = (s: ImportRow['status']) => ev.rows.filter((r) => r.status === s).length;
  const counts = { loaded: count('loaded'), rejected: count('rejected'), unmatched: count('unmatched') };
  const basis = (metricId: string, what: string, caveats: string[] = []): Basis => ({
    metricId,
    calculatedAt,
    basedOn: `${plural(ev.rows.length, 'row')} in ${fileName}, ${what}.`,
    caveats,
  });
  const resolved = ev.actions.flatMap((a) => (a.resolveBms ? [a.resolveBms] : []));
  return {
    fileName,
    kind: ev.kind,
    counts,
    rows: ev.rows,
    unknownColumns: ev.unknownColumns,
    effects: {
      birthRecordsAdded: ev.actions.length,
      batteriesCreated: ev.actions.filter((a) => a.type === 'create').length,
      unmatchedIdsResolved: resolved,
    },
    bases: {
      loaded: basis('import_rows_loaded', 'checked row by row'),
      rejected: basis('import_rows_rejected', 'checked row by row', [
        'Rejected rows do not block good rows. The file is kept as received.',
      ]),
      unmatched: basis('import_rows_unmatched', 'matched on exact ID only', [
        'Matching is exact. A near-miss such as a different case or a stray space does not match.',
      ]),
    },
    calculatedAt,
    asOf: calculatedAt,
  };
}

function apply(t: Tenant, ev: Evaluation, by: string, at: string) {
  for (const a of ev.actions) {
    let batteryId: string;
    if (a.type === 'give_birth') {
      a.battery.birth = a.birth;
      batteryId = a.battery.id;
    } else {
      batteryId = crypto.randomUUID();
      t.batteries.push({
        id: batteryId,
        manufacturerId: t.manufacturer.id,
        factorySerial: a.serial,
        bmsId: a.bmsId,
        birth: a.birth,
        deployment: null,
        reported: { sohPct: null, cycles: null, socPct: null },
        calc: { maxTempC: null, spreadMv: null, received: 0, expected: 0, longestGapHours: 0, lastSeenAt: null },
      });
    }
    if (a.resolveBms) {
      const i = t.unmatched.findIndex((u) => u.idValue === a.resolveBms);
      const u = t.unmatched[i];
      if (u) {
        t.unmatched.splice(i, 1);
        t.linkedIds.push({ batteryId, idType: 'bms_id', idValue: u.idValue, linkedAt: at, by, messagesReplayed: u.messagesHeld });
      }
    }
  }
  if (ev.kind === 'birth') t.freshness.registry = at;
}

export const importsRoutes: RouteModule = (ctx) => {
  const p = ctx.url.pathname;
  const t = ctx.tenant;

  if (ctx.method === 'GET' && p === '/imports') {
    const denied = ctx.need('imports.view');
    if (denied) return denied;
    const s = stateOf(t);
    return reply(200, {
      sampleFiles: s.files,
      history: [...s.session, ...s.base],
      asOf: new Date().toISOString(),
    });
  }

  const isPreview = ctx.method === 'POST' && p === '/imports/preview';
  const isApply = ctx.method === 'POST' && p === '/imports';
  if (!isPreview && !isApply) return null;

  const denied = ctx.need('imports.run');
  if (denied) return denied;
  const s = stateOf(t);
  const body = ImportBodySchema.safeParse(ctx.body);
  if (!body.success) {
    return fail(400, 'validation_failed', 'Send a file name and the text of a CSV file (up to 1 MB).');
  }
  const ev = evaluate(t, body.data.csv);
  if ('error' in ev) return fail(400, 'validation_failed', ev.error);

  const at = new Date().toISOString();
  const preview = previewOf(t, body.data.fileName, ev, at);
  if (isPreview) return reply(200, preview);

  apply(t, ev, ctx.user.name, at);
  const entry: ImportHistoryEntry = {
    importId: crypto.randomUUID(),
    fileName: body.data.fileName,
    kind: ev.kind,
    by: ctx.user.name,
    at,
    rowsLoaded: preview.counts.loaded,
    rowsRejected: preview.counts.rejected,
    rowsUnmatched: preview.counts.unmatched,
    unknownColumns: ev.unknownColumns,
  };
  s.session.unshift(entry);
  return reply(200, { ...preview, entry });
};
