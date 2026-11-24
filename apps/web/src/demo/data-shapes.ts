// The data contract for the three new screens. Owned by the lead.
// - test-data-agent implements the builders in data-battery.ts, data-imports.ts, data-connection.ts
//   with exactly these signatures, consistent with the batteries from data.ts.
// - screen agents read only through these types and builders; they never edit data*.ts.
// All values are fictional. No money, targets, accuracy figures or timelines.
import type { DemoBattery, DemoManufacturer } from './data';

// ---------------------------------------------------------------- battery view (data-battery.ts)

/** Registered at the factory (factory record extras beyond data.ts BirthRecord). */
export interface BirthExtras {
  shift: string; // e.g. "B"
  cellSupplier: string; // fictional supplier name
  cellLots: string[]; // lot ids used in this battery
  gradeSpread: string; // e.g. "A1–A3"
  eolResult: 'pass' | 'fail';
  eolDate: string; // ISO date
  firmwareAtBuild: string | null;
}

/** One cell, registered at the factory. Null values read "not recorded". */
export interface CellRecord {
  cellSerial: string;
  module: number; // 1-based
  slot: number; // 1-based within module
  lotId: string;
  ocvV: number | null;
  irMilliohm: number | null;
  capacityAh: number | null;
  grade: string | null;
}

export interface DeploymentEntry {
  holder: string;
  site: string;
  from: string; // ISO date
  to: string | null; // null = current
}

/** A health value as the BMS reported it (silver). */
export interface SohPoint {
  observedAt: string; // ISO timestamp
  sohPct: number;
}

/** The latest cell voltage reading the BMS sent. */
export interface CellVoltageReading {
  observedAt: string;
  cells: { module: number; slot: number; mv: number }[];
}

export interface DailyCoverage {
  day: string; // ISO date
  received: number;
  expected: number;
}

/** A silence longer than the gap limit (example setting: 2 hours). */
export interface GapInterval {
  from: string;
  to: string; // for a battery still silent, `to` is "now"
  hours: number;
}

export interface BatteryIdentifier {
  idType: 'factory_serial' | 'bms_id' | 'qr';
  value: string;
  source: 'birth_record' | 'admin_entry' | 'bms';
  linkedAt: string;
}

export interface BatteryDetailData {
  batteryId: string;
  birthExtras: BirthExtras | null; // null when the battery has no factory record
  cells: CellRecord[]; // [] when no factory record
  deployments: DeploymentEntry[]; // newest first; [] when none recorded
  sohHistory: SohPoint[]; // oldest first; last point equals reported.sohPct; [] if never reported
  cellVoltages: CellVoltageReading | null; // max−min ≤ calc.spreadMv
  dailyCoverage: DailyCoverage[]; // last 7 days, oldest first; sums equal calc.received / calc.expected
  gaps: GapInterval[]; // longest equals calc.longestGapHours when > 2 h
  identifiers: BatteryIdentifier[];
  faultCount30d: number | null; // null if never reported
}

export type BuildBatteryDetail = (b: DemoBattery, now: number) => BatteryDetailData;

// ---------------------------------------------------------------- factory data import (data-imports.ts)

export interface SampleFile {
  fileName: string;
  kind: 'birth' | 'test' | 'lot' | 'dispatch';
  description: string; // one plain sentence for the picker
  csv: string; // header row + rows, comma separated, no quoting needed
}

export interface ImportHistoryEntry {
  importId: string; // uuid
  fileName: string;
  kind: SampleFile['kind'];
  by: string; // a fictional Admin name from data.ts USERS
  at: string; // ISO timestamp
  rowsLoaded: number;
  rowsRejected: number;
  rowsUnmatched: number;
  unknownColumns: string[];
}

/**
 * Sample files built from the manufacturer's batteries, so they match by construction. The birth
 * file must include: the two Admin-entered batteries without factory record (they get matched), at
 * least one new battery, a row whose bms_id is the unmatched "BMS-7F3A9C" (resolves it), a row whose
 * bms_id already belongs to another battery (conflict → unmatched), a row with a bad date and a row
 * with no factory_serial (rejects), and one unknown column (stored, not dropped).
 */
export type BuildSampleFiles = (m: DemoManufacturer, batteries: DemoBattery[], now: number) => SampleFile[];
export type BuildImportHistory = (m: DemoManufacturer, now: number) => ImportHistoryEntry[];

// ---------------------------------------------------------------- BMS connection (data-connection.ts)

export interface Connector {
  connectorId: string; // uuid
  name: string;
  protocol: 'MQTT';
  status: 'active' | 'disabled';
  createdAt: string;
  lastMessageAt: string | null;
  messages24h: number;
  rejected24h: number;
  rejectReasons: { reason: string; count: number }[]; // counts sum to rejected24h
}

/** A field the BMS sent that the platform does not recognise: stored in `extra`, never dropped. */
export interface UnknownField {
  field: string;
  firstSeenAt: string;
  lastSeenAt: string;
  batteries: number;
  messages: number;
  sampleValue: string;
}

export type BuildConnectors = (m: DemoManufacturer, now: number) => Connector[];
export type BuildUnknownFields = (m: DemoManufacturer, now: number) => UnknownField[];
