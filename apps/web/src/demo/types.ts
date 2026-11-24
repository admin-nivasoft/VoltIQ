// Demo-only response shapes for the BPTE screens. packages/contracts is not edited in this pass, so
// these zod schemas stand in for the contracts the API will need later (see the list at the end of
// bpte/STATUS.md). The screens validate every demo response against them, as the real app does.
import { IsoTimestamp, Uuid, z } from '@ql/contracts';

export const SourceSchema = z.enum(['bms', 'calculated', 'registered']);
export type Source = z.infer<typeof SourceSchema>;

export const DemoRoleSchema = z.enum(['battery_manager', 'admin']);
export type DemoRole = z.infer<typeof DemoRoleSchema>;

export const DemoPermissionSchema = z.enum([
  'fleet.view',
  'batteries.view',
  'imports.view',
  'imports.run',
  'connection.view',
  'connection.manage',
]);
export type DemoPermission = z.infer<typeof DemoPermissionSchema>;

export const DemoMeSchema = z.object({
  user: z.object({ id: Uuid, name: z.string(), role: DemoRoleSchema }),
  manufacturer: z.object({ id: Uuid, name: z.string() }),
  permissions: z.array(DemoPermissionSchema),
  asOf: IsoTimestamp,
});
export type DemoMe = z.infer<typeof DemoMeSchema>;

// ---- Metric dictionary (reference) ----
export const MetricDefinitionSchema = z.object({
  metricId: z.string(),
  version: z.number().int(),
  status: z.enum(['draft', 'active', 'retired']),
  label: z.string(),
  unit: z.string(),
  source: SourceSchema,
  words: z.string(),
  symbols: z.string(),
  inputs: z.array(
    z.object({ name: z.string(), from: z.enum(['bms', 'calculated', 'registered', 'setting']) }),
  ),
});
export type MetricDefinition = z.infer<typeof MetricDefinitionSchema>;
export const MetricListSchema = z.object({ items: z.array(MetricDefinitionSchema), asOf: IsoTimestamp });

/** What a figure is based on, and what makes it less reliable. Built per answer, not per metric. */
export const BasisSchema = z.object({
  metricId: z.string(),
  calculatedAt: IsoTimestamp,
  basedOn: z.string(),
  caveats: z.array(z.string()),
});
export type Basis = z.infer<typeof BasisSchema>;

// ---- Example settings (this fictional manufacturer's, not product defaults) ----
export const SeveritySchema = z.enum(['high', 'medium', 'low']);
export type Severity = z.infer<typeof SeveritySchema>;

export const WarningRuleSchema = z.object({
  ruleId: z.string(),
  version: z.number().int(),
  metricId: z.string(),
  /** Plain words, e.g. "Health below 80%". */
  condition: z.string(),
  severity: SeveritySchema,
});
export type WarningRule = z.infer<typeof WarningRuleSchema>;

export const SettingsSchema = z.object({
  reportingWindowHours: z.number(),
  sendIntervalMinutes: z.number(),
  coveragePeriodDays: z.number(),
  gapCoverageBelowPct: z.number(),
  gapLongerThanHours: z.number(),
  healthBandPct: z.number(),
  cycleBand: z.number(),
  rules: z.array(WarningRuleSchema),
});
export type Settings = z.infer<typeof SettingsSchema>;

// ---- Fleet overview ----
const Count = z.object({ value: z.number().int(), basis: BasisSchema });

export const DistributionSchema = z.object({
  n: z.number().int(),
  excluded: z.number().int(),
  min: z.number().nullable(),
  median: z.number().nullable(),
  max: z.number().nullable(),
  mean: z.number().nullable(),
  bands: z.array(z.object({ from: z.number(), to: z.number(), count: z.number().int() })),
  basis: BasisSchema,
});
export type Distribution = z.infer<typeof DistributionSchema>;

export const BatteryRefSchema = z.object({
  batteryId: Uuid,
  factorySerial: z.string().nullable(),
  bmsId: z.string().nullable(),
});
export type BatteryRef = z.infer<typeof BatteryRefSchema>;

export const OpenWarningSchema = z.object({
  warningId: Uuid,
  battery: BatteryRefSchema,
  ruleId: z.string(),
  condition: z.string(),
  severity: SeveritySchema,
  /** The value that broke the rule, with its unit, e.g. "58.4 °C"; null for "no data". */
  observed: z.string().nullable(),
  detectedAt: IsoTimestamp,
});
export type OpenWarning = z.infer<typeof OpenWarningSchema>;

export const GapRowSchema = z.object({
  battery: BatteryRefSchema,
  coveragePct: z.number(),
  longestGapHours: z.number(),
  lastSeenAt: IsoTimestamp.nullable(),
});
export type GapRow = z.infer<typeof GapRowSchema>;

export const UnmatchedRowSchema = z.object({
  unmatchedId: Uuid,
  idType: z.enum(['bms_id']),
  idValue: z.string(),
  firstSeenAt: IsoTimestamp,
  lastSeenAt: IsoTimestamp,
  messagesHeld: z.number().int(),
});
export type UnmatchedRow = z.infer<typeof UnmatchedRowSchema>;

export const FleetOverviewSchema = z.object({
  manufacturer: z.object({ id: Uuid, name: z.string() }),
  settings: SettingsSchema,
  registered: Count,
  reporting: Count,
  noBirthRecord: Count.extend({ batteries: z.array(BatteryRefSchema) }),
  health: DistributionSchema,
  cycles: DistributionSchema,
  coverage: z.object({ pct: z.number().nullable(), received: z.number().int(), expected: z.number().int(), basis: BasisSchema }),
  gaps: Count.extend({ batteries: z.array(GapRowSchema) }),
  unmatched: Count.extend({ ids: z.array(UnmatchedRowSchema) }),
  warnings: z.object({
    bySeverity: z.object({ high: z.number().int(), medium: z.number().int(), low: z.number().int() }),
    open: z.array(OpenWarningSchema),
    basis: BasisSchema,
  }),
  /** When each panel's data was last refreshed. */
  updated: z.object({
    registry: IsoTimestamp,
    bms: IsoTimestamp,
    calculations: IsoTimestamp,
  }),
  asOf: IsoTimestamp,
});
export type FleetOverview = z.infer<typeof FleetOverviewSchema>;

// ---- Battery list (fleet table) ----
export const BatteryRowSchema = z.object({
  battery: BatteryRefSchema,
  model: z.string().nullable(),
  holder: z.string().nullable(),
  site: z.string().nullable(),
  sohReportedPct: z.number().nullable(),
  cyclesReported: z.number().int().nullable(),
  coveragePct: z.number().nullable(),
  lastSeenAt: IsoTimestamp.nullable(),
  openWarnings: z.number().int(),
  worstSeverity: SeveritySchema.nullable(),
  hasBirthRecord: z.boolean(),
});
export type BatteryRow = z.infer<typeof BatteryRowSchema>;

export const BatteryPageSchema = z.object({
  items: z.array(BatteryRowSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  asOf: IsoTimestamp,
});
export type BatteryPage = z.infer<typeof BatteryPageSchema>;
