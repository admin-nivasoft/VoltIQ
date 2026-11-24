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
    words: 'The latest valid state-of-health value the battery management system sent. We do not calculate it.',
    symbols: 'soh_reported = latest(SOH_PCT, quality = ok)',
    inputs: [{ name: `${BMS_FIELD.soh} (fictional BMS)`, from: 'bms' }],
  }),
  m({
    metricId: 'cycle_count_reported',
    label: 'Cycles (reported by BMS)',
    unit: 'cycles',
    source: 'bms',
    words: 'The latest valid cycle counter value the battery management system sent. We do not calculate it.',
    symbols: 'cycles_reported = latest(CYCLE_CNT, quality = ok)',
    inputs: [{ name: `${BMS_FIELD.cycles} (fictional BMS)`, from: 'bms' }],
  }),
  // ---- Per battery: calculated (gold) ----
  m({
    metricId: 'max_temp_c',
    label: 'Max temperature',
    unit: '°C',
    source: 'calculated',
    words: 'The highest cell temperature among good-quality readings in the period.',
    symbols: 'max_temp = max(T_CELL[n] : quality = ok, in period)',
    inputs: [{ name: `${BMS_FIELD.cellTemp} (fictional BMS)`, from: 'bms' }],
  }),
  m({
    metricId: 'cell_voltage_spread_mv',
    label: 'Cell voltage spread',
    unit: 'mV',
    source: 'calculated',
    words:
      'For each moment the battery reported, the highest cell voltage minus the lowest. The figure is the largest of these in the period.',
    symbols: 'spread = max over t of ( max(V_CELL[n], t) − min(V_CELL[n], t) )',
    inputs: [{ name: `${BMS_FIELD.cellVoltage} (fictional BMS)`, from: 'bms' }],
  }),
  m({
    metricId: 'data_coverage_pct',
    label: 'Data coverage',
    unit: '%',
    source: 'calculated',
    words:
      'Messages received (duplicates counted once) divided by the messages the BMS should have sent while deployed, times 100.',
    symbols: 'coverage = received_unique ÷ expected × 100',
    inputs: [
      { name: 'Messages received (de-duplicated)', from: 'bms' },
      { name: 'Expected send rate (manufacturer setting)', from: 'setting' },
      { name: 'Deployment start date', from: 'registered' },
    ],
  }),
  m({
    metricId: 'last_seen_at',
    label: 'Last data received',
    unit: 'time',
    source: 'calculated',
    words: 'The time the most recent message from this battery arrived.',
    symbols: 'last_seen = max(received_at)',
    inputs: [{ name: 'Message receipt time', from: 'bms' }],
  }),
  // ---- Fleet aggregates ----
  m({
    metricId: 'batteries_registered',
    label: 'Batteries registered',
    unit: 'batteries',
    source: 'calculated',
    words: 'The number of battery records for this manufacturer.',
    symbols: 'N = count(battery)',
    inputs: [{ name: 'Battery records (birth record or Admin entry)', from: 'registered' }],
  }),
  m({
    metricId: 'batteries_reporting',
    label: 'Batteries reporting',
    unit: 'batteries',
    source: 'calculated',
    words: 'The number of batteries whose last message arrived within the reporting window.',
    symbols: 'count(b : now − last_seen(b) ≤ W)',
    inputs: [
      { name: 'Last data received, per battery', from: 'calculated' },
      { name: 'Reporting window W (manufacturer setting)', from: 'setting' },
    ],
  }),
  m({
    metricId: 'batteries_no_birth_record',
    label: 'Batteries without birth record',
    unit: 'batteries',
    source: 'calculated',
    words: 'Batteries an Admin entered by hand that have no factory birth record yet.',
    symbols: 'count(b : birth(b) = none)',
    inputs: [
      { name: 'Battery records', from: 'registered' },
      { name: 'Birth records', from: 'registered' },
    ],
  }),
  m({
    metricId: 'fleet_soh_reported_mean',
    label: 'Fleet health, mean (reported by BMS)',
    unit: '%',
    source: 'calculated',
    words:
      'The average of the latest health value each battery reported. Batteries with no reported value are left out, and how many is shown.',
    symbols: 'mean = Σ soh_reported(b) ÷ n,  n = batteries with a value',
    inputs: [{ name: `Health (reported by BMS), per battery: ${BMS_FIELD.soh}`, from: 'bms' }],
  }),
  m({
    metricId: 'fleet_soh_reported_distribution',
    label: 'Fleet health distribution (reported by BMS)',
    unit: '%',
    source: 'calculated',
    words:
      'Lowest, middle (median) and highest reported health, and how many batteries fall in each band. Batteries with no reported value are left out, and how many is shown.',
    symbols: 'min, median, max; count per band of width B over batteries with a value',
    inputs: [
      { name: `Health (reported by BMS), per battery: ${BMS_FIELD.soh}`, from: 'bms' },
      { name: 'Band width B (manufacturer setting)', from: 'setting' },
    ],
  }),
  m({
    metricId: 'fleet_cycle_count_distribution',
    label: 'Fleet cycles distribution (reported by BMS)',
    unit: 'cycles',
    source: 'calculated',
    words:
      'Lowest, middle (median) and highest reported cycle count, and how many batteries fall in each band. Batteries with no reported value are left out, and how many is shown.',
    symbols: 'min, median, max; count per band of width B over batteries with a value',
    inputs: [
      { name: `Cycles (reported by BMS), per battery: ${BMS_FIELD.cycles}`, from: 'bms' },
      { name: 'Band width B (manufacturer setting)', from: 'setting' },
    ],
  }),
  m({
    metricId: 'fleet_data_coverage_pct',
    label: 'Fleet data coverage',
    unit: '%',
    source: 'calculated',
    words:
      'All messages received across the fleet (duplicates counted once) divided by all messages expected, over the period, times 100.',
    symbols: 'coverage = Σ received_unique(b) ÷ Σ expected(b) × 100, over period P',
    inputs: [
      { name: 'Messages received and expected, per battery', from: 'bms' },
      { name: 'Expected send rate and period P (manufacturer settings)', from: 'setting' },
    ],
  }),
  m({
    metricId: 'batteries_with_gaps',
    label: 'Batteries with data gaps',
    unit: 'batteries',
    source: 'calculated',
    words: 'Batteries whose coverage is below the limit, or whose longest silence is longer than the limit.',
    symbols: 'count(b : coverage(b) < C  or  max_gap(b) > G)',
    inputs: [
      { name: 'Data coverage and longest gap, per battery', from: 'calculated' },
      { name: 'Limits C and G (manufacturer settings)', from: 'setting' },
    ],
  }),
  m({
    metricId: 'unmatched_id_count',
    label: 'Unmatched IDs',
    unit: 'IDs',
    source: 'calculated',
    words:
      'BMS IDs that sent data but match no registered battery. Their data is held, not dropped, until an Admin links the ID or a birth record arrives.',
    symbols: 'count(unmatched_record : status = open)',
    inputs: [{ name: 'Unmatched records held in silver', from: 'bms' }],
  }),
  m({
    metricId: 'open_warnings_by_severity',
    label: 'Open warnings by severity',
    unit: 'warnings',
    source: 'calculated',
    words: 'Warnings that are still open, counted per severity. Each warning comes from one rule.',
    symbols: 'count(warning : open) grouped by severity',
    inputs: [
      { name: 'Warnings raised by the rules', from: 'calculated' },
      { name: 'Rule thresholds and severities (manufacturer settings)', from: 'setting' },
    ],
  }),
];
