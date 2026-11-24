// Demo-only response shape for the battery screen (GET /batteries/:batteryId). Stands in for the
// contract the API will need later; the screen validates the response against it.
import { IsoTimestamp, Uuid, z } from '@ql/contracts';
import { BasisSchema, SeveritySchema, SourceSchema } from './types';

/** One figure on the screen: where it comes from, when it was last updated, and its working. */
export const FigureSchema = z.object({
  source: SourceSchema,
  /** null when nothing has ever arrived for this figure. */
  updatedAt: IsoTimestamp.nullable(),
  basis: BasisSchema,
});
export type Figure = z.infer<typeof FigureSchema>;

const Num = z.number().nullable();

export const BatteryWarningSchema = z.object({
  ruleId: z.string(),
  condition: z.string(),
  severity: SeveritySchema,
  observed: z.string().nullable(),
  detectedAt: IsoTimestamp,
  /** Plain words: the signal, the value, the rule and the limit. */
  explanation: z.string(),
  /** Direction of travel when the history shows it, otherwise null. */
  trend: z.string().nullable(),
});
export type BatteryWarning = z.infer<typeof BatteryWarningSchema>;

export const BatteryDetailSchema = z.object({
  battery: z.object({
    batteryId: Uuid,
    factorySerial: z.string(),
    bmsId: z.string(),
    model: z.string().nullable(),
    holder: z.string().nullable(),
    site: z.string().nullable(),
  }),
  birth: z
    .object({
      buildDate: z.string(),
      line: z.string().nullable(),
      model: z.string().nullable(),
      chemistry: z.string().nullable(),
      ratedCapacityAh: z.number().nullable(),
      firmware: z.string().nullable(),
      shift: z.string().nullable(),
      cellSupplier: z.string().nullable(),
      cellLots: z.array(z.string()),
      gradeSpread: z.string().nullable(),
      eolResult: z.enum(['pass', 'fail']).nullable(),
      eolDate: z.string().nullable(),
      firmwareAtBuild: z.string().nullable(),
    })
    .nullable(),
  warnings: z.array(BatteryWarningSchema),
  field: z.object({
    sohPct: Num,
    cycles: z.number().int().nullable(),
    socPct: Num,
    maxTempC: Num,
    spreadMv: Num,
    faultCount30d: z.number().int().nullable(),
    lastSeenAt: IsoTimestamp.nullable(),
    tempPeriodDays: z.number().int(),
    faultPeriodDays: z.number().int(),
  }),
  sohHistory: z.array(z.object({ observedAt: IsoTimestamp, sohPct: z.number() })),
  sohRuleLimitPct: z.number(),
  cellVoltages: z
    .object({
      observedAt: IsoTimestamp,
      cells: z.array(z.object({ module: z.number().int(), slot: z.number().int(), mv: z.number() })),
    })
    .nullable(),
  cells: z.array(
    z.object({
      cellSerial: z.string(),
      module: z.number().int(),
      slot: z.number().int(),
      lotId: z.string(),
      ocvV: Num,
      irMilliohm: Num,
      capacityAh: Num,
      grade: z.string().nullable(),
    }),
  ),
  deployments: z.array(
    z.object({ holder: z.string(), site: z.string(), from: z.string(), to: z.string().nullable() }),
  ),
  coverage: z.object({
    pct: Num,
    received: z.number().int(),
    expected: z.number().int(),
    periodDays: z.number().int(),
    longestGapHours: z.number(),
    gapLimitHours: z.number(),
    daily: z.array(z.object({ day: z.string(), received: z.number().int(), expected: z.number().int() })),
    gaps: z.array(z.object({ from: IsoTimestamp, to: IsoTimestamp, hours: z.number() })),
  }),
  identifiers: z.array(
    z.object({
      idType: z.enum(['factory_serial', 'bms_id', 'qr']),
      value: z.string(),
      source: z.enum(['birth_record', 'admin_entry', 'bms']),
      linkedAt: IsoTimestamp,
      linkedBy: z.string().nullable(),
      messagesReplayed: z.number().int().nullable(),
    }),
  ),
  /** Keyed by metric id. */
  figures: z.record(FigureSchema),
  updated: z.object({ bms: IsoTimestamp, calculations: IsoTimestamp, registry: IsoTimestamp }),
  asOf: IsoTimestamp,
});
export type BatteryDetail = z.infer<typeof BatteryDetailSchema>;
