// The metric dictionary as the demo serves it (GET /metrics). Each entry is copied from
// bpte/data-model/metrics.md (version 1, draft); the demo does not define any metric of its own.
// Field names marked "fictional BMS" belong to the made-up battery management system in data.ts:
// the real field names are not known until the first manufacturer's BMS documents arrive.
import type { MetricDefinition } from './types';

/** The fictional BMS's field names, shown in the "how this is worked out" panels. */
export const BMS_FIELD = {
  soh: 'SOH_PCT',
  cycles: 'CYCLE_CNT',
  cellTemp: 'T_CELL[n]',
  cellVoltage: 'V_CELL[n]',
  soc: 'SOC_PCT',
} as const;

const m = (d: Omit<MetricDefinition, 'version' | 'status'>): MetricDefinition => ({
  version: 1,
  status: 'draft',
  ...d,
});

export const METRICS: MetricDefinition[] = [
  // ---- Per battery: reported by the BMS (silver, never copied into gold) ----
  m({
    metricId: 'soh_reported_pct',
    label: 'Health (reported by BMS)',
    unit: '%',
    source: 'bms',
    words: 'The latest health value from the battery’s own system (BMS). We do not work it out ourselves.',
    symbols: 'In short: the newest health value the BMS sent',
    inputs: [{ name: 'Health value from the BMS', from: 'bms' }],
  }),
  m({
    metricId: 'cycle_count_reported',
    label: 'Cycles (reported by BMS)',
    unit: 'cycles',
    source: 'bms',
    words: 'The latest charge-cycle count from the battery’s own system (BMS). We do not work it out ourselves.',
    symbols: 'In short: the newest cycle count the BMS sent',
    inputs: [{ name: 'Cycle count from the BMS', from: 'bms' }],
  }),
  // ---- Per battery: calculated (gold) ----
  m({
    metricId: 'max_temp_c',
    label: 'Max temperature',
    unit: '°C',
    source: 'calculated',
    words: 'The hottest cell temperature the battery’s own system (BMS) reported in this period. Faulty readings are ignored.',
    symbols: 'In short: the highest cell temperature in the period',
    inputs: [{ name: 'Cell temperatures from the BMS', from: 'bms' }],
  }),
  m({
    metricId: 'cell_voltage_spread_mv',
    label: 'Difference between cells',
    unit: 'mV',
    source: 'calculated',
    words:
      'At each reading, we take the highest cell voltage minus the lowest. The number shown is the biggest difference in the period.',
    symbols: 'In short: highest cell voltage − lowest cell voltage, biggest value in the period',
    inputs: [{ name: 'Cell voltages from the BMS', from: 'bms' }],
  }),
  m({
    metricId: 'data_coverage_pct',
    label: 'Data received',
    unit: '%',
    source: 'calculated',
    words:
      'How many of the messages we expected from the battery’s own system (BMS) actually arrived. Repeated messages count once.',
    symbols: 'In short: messages received ÷ messages expected × 100',
    inputs: [
      { name: 'Messages received, repeats removed', from: 'bms' },
      { name: 'Expected send rate (manufacturer setting)', from: 'setting' },
      { name: 'Deployment start date', from: 'registered' },
    ],
  }),
  m({
    metricId: 'last_seen_at',
    label: 'Last data received',
    unit: 'time',
    source: 'calculated',
    words: 'The time the newest message from this battery arrived.',
    symbols: 'In short: the latest arrival time of any message',
    inputs: [{ name: 'Time each message arrived', from: 'bms' }],
  }),
  m({
    metricId: 'soc_pct',
    label: 'Charge level',
    unit: '%',
    source: 'bms',
    words: 'The latest charge level from the battery’s own system (BMS). It shows how full the battery is.',
    symbols: 'In short: the newest charge level the BMS sent',
    inputs: [{ name: 'Charge level from the BMS', from: 'bms' }],
  }),
  m({
    metricId: 'soh_reported_history',
    label: 'Health history (reported by BMS)',
    unit: '%',
    source: 'bms',
    words: 'Every health value from the battery’s own system (BMS), oldest first. We work out nothing here.',
    symbols: 'In short: each health value with the time it was sent',
    inputs: [{ name: 'Health values from the BMS', from: 'bms' }],
  }),
  m({
    metricId: 'fault_count',
    label: 'Faults',
    unit: 'faults',
    source: 'calculated',
    words: 'How many faults the battery’s own system (BMS) reported in this period. We count them by fault type.',
    symbols: 'In short: number of fault events, grouped by fault type',
    inputs: [{ name: 'Fault events from the BMS', from: 'bms' }],
  }),
  m({
    metricId: 'rated_capacity_ah',
    label: 'Rated capacity',
    unit: 'Ah',
    source: 'registered',
    words: 'The capacity the factory recorded for this battery.',
    symbols: 'In short: copied from the factory record',
    inputs: [{ name: 'Factory record: rated capacity', from: 'registered' }],
  }),
  m({
    metricId: 'build_date',
    label: 'Build date',
    unit: 'date',
    source: 'registered',
    words: 'The date the factory recorded as the day this battery was built.',
    symbols: 'In short: copied from the factory record',
    inputs: [{ name: 'Factory record: build date', from: 'registered' }],
  }),
  m({
    metricId: 'data_gaps',
    label: 'Time with no data',
    unit: 'hours',
    source: 'calculated',
    words:
      'We look for times when no message arrived for longer than the set limit. The longest one is the number shown.',
    symbols: 'In short: the longest wait between two messages, if over the limit; 0 if none',
    inputs: [
      { name: 'Time each message arrived, repeats removed', from: 'bms' },
      { name: 'Time limit and period (manufacturer settings)', from: 'setting' },
    ],
  }),
  m({
    metricId: 'data_coverage_daily_pct',
    label: 'Data received, daily',
    unit: '%',
    source: 'calculated',
    words: 'The same as data received, worked out for each calendar day.',
    symbols: 'In short: messages received that day ÷ messages expected that day × 100',
    inputs: [
      { name: 'Messages received each day, repeats removed', from: 'bms' },
      { name: 'Expected send rate (manufacturer setting)', from: 'setting' },
    ],
  }),
  m({
    metricId: 'connector_last_seen_at',
    label: 'Last message received',
    unit: 'time',
    source: 'calculated',
    words: 'The time the newest message arrived through this connection.',
    symbols: 'In short: the latest arrival time on this connection',
    inputs: [{ name: 'Time each message arrived, per connection', from: 'bms' }],
  }),
  m({
    metricId: 'connector_messages_received',
    label: 'Messages received',
    unit: 'messages',
    source: 'calculated',
    words: 'How many messages arrived through this connection in the period.',
    symbols: 'In short: number of messages in the period',
    inputs: [
      { name: 'Messages exactly as they arrived', from: 'bms' },
      { name: 'Period (manufacturer setting)', from: 'setting' },
    ],
  }),
  m({
    metricId: 'connector_messages_rejected',
    label: 'Messages rejected',
    unit: 'messages',
    source: 'calculated',
    words: 'How many messages through this connection failed our checks in the period. Each has a reason. We still keep every message.',
    symbols: 'In short: number of failed messages in the period, grouped by reason',
    inputs: [
      { name: 'Rejected messages with reason', from: 'bms' },
      { name: 'Period (manufacturer setting)', from: 'setting' },
    ],
  }),
  m({
    metricId: 'connector_data_coverage_pct',
    label: 'Connection data received',
    unit: '%',
    source: 'calculated',
    words: 'Messages received from the batteries on this connection, compared with the messages they should have sent.',
    symbols: 'In short: messages received ÷ messages expected × 100, for these batteries',
    inputs: [
      { name: 'Messages received and expected, per battery', from: 'bms' },
      { name: 'Expected send rate and period (manufacturer settings)', from: 'setting' },
    ],
  }),
  m({
    metricId: 'unknown_fields_received',
    label: 'Unrecognised data fields',
    unit: 'fields',
    source: 'calculated',
    words:
      'Data names from the battery’s own system (BMS) that we do not recognise yet. We show how many messages and batteries sent each. We keep them.',
    symbols: 'In short: each unknown data name, with its message and battery counts',
    inputs: [{ name: 'Unrecognised data kept with each message', from: 'bms' }],
  }),
  m({
    metricId: 'import_rows_loaded',
    label: 'Rows loaded',
    unit: 'rows',
    source: 'calculated',
    words: 'Rows from this file that passed our checks and were saved to the battery records.',
    symbols: 'In short: number of rows saved from this file',
    inputs: [{ name: 'Rows of the imported file', from: 'registered' }],
  }),
  m({
    metricId: 'import_rows_rejected',
    label: 'Rows rejected',
    unit: 'rows',
    source: 'calculated',
    words: 'Rows from this file that failed a check, each with its reason. We keep the original file.',
    symbols: 'In short: number of rows that failed a check',
    inputs: [{ name: 'Rows of the imported file', from: 'registered' }],
  }),
  m({
    metricId: 'import_rows_unmatched',
    label: 'Rows with no battery',
    unit: 'rows',
    source: 'calculated',
    words: 'Rows that loaded but did not match exactly one battery. They wait until an Admin sorts them out.',
    symbols: 'In short: loaded rows that match zero or several batteries',
    inputs: [
      { name: 'Rows of the imported file', from: 'registered' },
      { name: 'Rules for matching battery IDs', from: 'registered' },
    ],
  }),
  // ---- Fleet aggregates ----
  m({
    metricId: 'batteries_registered',
    label: 'Batteries on record',
    unit: 'batteries',
    source: 'calculated',
    words: 'How many batteries we hold a record for, for this manufacturer.',
    symbols: 'In short: number of battery records',
    inputs: [{ name: 'Battery records (factory record or Admin entry)', from: 'registered' }],
  }),
  m({
    metricId: 'batteries_reporting',
    label: 'Batteries reporting',
    unit: 'batteries',
    source: 'calculated',
    words: 'How many batteries sent a message recently. “Recently” is the time window set below.',
    symbols: 'In short: batteries whose last message is newer than the time window',
    inputs: [
      { name: 'Last data received, per battery', from: 'calculated' },
      { name: 'Time window (manufacturer setting)', from: 'setting' },
    ],
  }),
  m({
    metricId: 'batteries_no_birth_record',
    label: 'Batteries without factory record',
    unit: 'batteries',
    source: 'calculated',
    words: 'Batteries an Admin entered by hand that have no factory record yet.',
    symbols: 'In short: battery records with no matching factory record',
    inputs: [
      { name: 'Battery records', from: 'registered' },
      { name: 'Factory records', from: 'registered' },
    ],
  }),
  m({
    metricId: 'fleet_soh_reported_mean',
    label: 'Average health (reported by BMS)',
    unit: '%',
    source: 'calculated',
    words:
      'The average of the latest health value from each battery’s own system (BMS). Batteries with no value are left out. We show how many.',
    symbols: 'In short: sum of latest health values ÷ number of batteries with a value',
    inputs: [{ name: 'Health (reported by BMS), per battery', from: 'bms' }],
  }),
  m({
    metricId: 'fleet_soh_reported_distribution',
    label: 'Health range (reported by BMS)',
    unit: '%',
    source: 'calculated',
    words:
      'The lowest, middle and highest health from each battery’s own system (BMS). We also count batteries in each step. Batteries with no value are left out.',
    symbols: 'In short: lowest, middle and highest value, plus a count per step',
    inputs: [
      { name: 'Health (reported by BMS), per battery', from: 'bms' },
      { name: 'Step size (manufacturer setting)', from: 'setting' },
    ],
  }),
  m({
    metricId: 'fleet_cycle_count_distribution',
    label: 'Cycles range (reported by BMS)',
    unit: 'cycles',
    source: 'calculated',
    words:
      'The lowest, middle and highest cycle count from each battery’s own system (BMS). We also count batteries in each step. Batteries with no value are left out.',
    symbols: 'In short: lowest, middle and highest value, plus a count per step',
    inputs: [
      { name: 'Cycles (reported by BMS), per battery', from: 'bms' },
      { name: 'Step size (manufacturer setting)', from: 'setting' },
    ],
  }),
  m({
    metricId: 'fleet_data_coverage_pct',
    label: 'Fleet data received',
    unit: '%',
    source: 'calculated',
    words:
      'All messages received across the fleet, compared with all messages expected in the period. Repeated messages count once.',
    symbols: 'In short: messages received ÷ messages expected × 100, all batteries',
    inputs: [
      { name: 'Messages received and expected, per battery', from: 'bms' },
      { name: 'Expected send rate and period (manufacturer settings)', from: 'setting' },
    ],
  }),
  m({
    metricId: 'batteries_with_gaps',
    label: 'Batteries missing data',
    unit: 'batteries',
    source: 'calculated',
    words: 'Batteries that received too little data, or went too long with no data. Both limits are settings.',
    symbols: 'In short: batteries below the data-received limit or over the no-data limit',
    inputs: [
      { name: 'Data received and longest time with no data, per battery', from: 'calculated' },
      { name: 'Two limits (manufacturer settings)', from: 'setting' },
    ],
  }),
  m({
    metricId: 'unmatched_id_count',
    label: 'Unrecognised battery IDs',
    unit: 'IDs',
    source: 'calculated',
    words:
      'Battery IDs that sent data but match no battery on record. We keep their data until an Admin links the ID or a factory record arrives.',
    symbols: 'In short: number of unresolved IDs',
    inputs: [{ name: 'Data kept for unrecognised IDs', from: 'bms' }],
  }),
  m({
    metricId: 'open_warnings_by_severity',
    label: 'Open warnings by severity',
    unit: 'warnings',
    source: 'calculated',
    words: 'Warnings that are still open, counted per severity. Each warning comes from one rule.',
    symbols: 'In short: open warnings, grouped by severity',
    inputs: [
      { name: 'Warnings raised by the rules', from: 'calculated' },
      { name: 'Rule thresholds and severities (manufacturer settings)', from: 'setting' },
    ],
  }),
];
