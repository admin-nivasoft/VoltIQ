import {
  z,
  Uuid,
  IsoTimestamp,
  Confidence,
  PackStatusSchema,
  WarrantyStatusSchema,
} from './common.js';

export const FleetSummarySchema = z
  .object({
    packsInService: z.number().int().min(0),
    /** Mean of each in-service pack's latest SoH, 1 decimal. Null when no packs are in service. */
    averageSohPct: z.number().min(0).max(100).nullable(),
    activeAlerts: z.number().int().min(0),
    packsNearingEol: z.number().int().min(0),
    asOf: IsoTimestamp,
  })
  .openapi('FleetSummary');
export type FleetSummary = z.infer<typeof FleetSummarySchema>;

export const TrendDirections = ['declining', 'stable', 'improving', 'insufficient_data'] as const;

export const PackSummarySchema = z
  .object({
    id: Uuid,
    serial: z.string(),
    spec: z.string(),
    assetId: z.string().nullable(),
    status: PackStatusSchema,
    warrantyStatus: WarrantyStatusSchema,
    sohPct: z.number().min(0).max(100).nullable(),
    trend: z.object({
      direction: z.enum(TrendDirections),
      /** Least-squares slope in SoH points per 30 days (D-10). Null when there is not enough data. */
      pointsPer30Days: z.number().nullable(),
    }),
    remainingLife: z
      .object({
        monthsLow: z.number().min(0),
        monthsHigh: z.number().min(0),
        confidence: Confidence,
      })
      .nullable(),
    modelVersion: z.string().nullable(),
    recordedAt: IsoTimestamp.nullable(),
  })
  .openapi('PackSummary');
export type PackSummary = z.infer<typeof PackSummarySchema>;

export const PackSortFields = [
  'serial',
  'sohPct',
  'trend',
  'remainingLife',
  'warrantyStatus',
] as const;
export const PackQuerySchema = z.object({
  q: z.string().max(100).optional(),
});
