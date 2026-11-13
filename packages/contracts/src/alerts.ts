import { z, Uuid, IsoTimestamp, Confidence, SeveritySchema } from './common.js';

export const AlertStatuses = ['open', 'acknowledged', 'resolved'] as const;
export const AlertStatusSchema = z.enum(AlertStatuses);

/**
 * Whitelist of consumer-facing model signals (D-09). Unknown keys are stripped on parse, so
 * whatever the model writes into the jsonb column cannot leak internal quality data.
 */
export const AlertSignalsSchema = z.object({
  capacity_fade: z.number().optional(),
  resistance_rise: z.number().optional(),
  temperature_excursions: z.number().optional(),
  charge_pattern_score: z.number().optional(),
});

/** Consumer-facing alert text only (SCR-04-FR-04). */
export const AlertSchema = z
  .object({
    id: Uuid,
    packId: Uuid,
    packSerial: z.string(),
    severity: SeveritySchema,
    title: z.string(),
    description: z.string(),
    recommendedAction: z.string(),
    status: AlertStatusSchema,
    createdAt: IsoTimestamp,
    acknowledgedBy: z.string().nullable(),
    acknowledgedAt: IsoTimestamp.nullable(),
    modelVersion: z.string(),
    confidence: Confidence.nullable(),
    signals: AlertSignalsSchema.nullable(),
  })
  .openapi('Alert');
export type Alert = z.infer<typeof AlertSchema>;

export const AlertSortFields = ['createdAt', 'severity', 'status'] as const;
export const AlertQuerySchema = z.object({
  status: AlertStatusSchema.optional(),
  severity: SeveritySchema.optional(),
});
