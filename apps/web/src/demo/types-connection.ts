// Response shapes for the BMS connection screen (demo only). Same pattern as types.ts.
import { IsoTimestamp, Uuid, z } from '@ql/contracts';
import { BasisSchema } from './types';

export const ReportingStatusSchema = z.enum(['reporting', 'quiet', 'never']);
export type ReportingStatus = z.infer<typeof ReportingStatusSchema>;

export const ConnectorRowSchema = z.object({
  connectorId: Uuid,
  name: z.string(),
  protocol: z.string(),
  status: z.enum(['active', 'disabled']),
  createdAt: IsoTimestamp,
  lastMessageAt: IsoTimestamp.nullable(),
  messages24h: z.number().int(),
  rejected24h: z.number().int(),
  rejectReasons: z.array(z.object({ reason: z.string(), count: z.number().int() })),
  /** Null when the connector serves no battery (disabled). */
  coveragePct: z.number().nullable(),
});

export const DayCoverageSchema = z.object({
  day: z.string(),
  received: z.number().int(),
  expected: z.number().int(),
  pct: z.number().nullable(),
});

export const BatteryReportingSchema = z.object({
  batteryId: Uuid,
  factorySerial: z.string(),
  bmsId: z.string(),
  status: ReportingStatusSchema,
  lastSeenAt: IsoTimestamp.nullable(),
  coveragePct: z.number().nullable(),
  days: z.array(DayCoverageSchema),
  longestGapHours: z.number(),
});
export type BatteryReporting = z.infer<typeof BatteryReportingSchema>;

export const GapRowSchema = z.object({
  batteryId: Uuid,
  factorySerial: z.string(),
  from: IsoTimestamp,
  to: IsoTimestamp,
  hours: z.number(),
  ongoing: z.boolean(),
});

export const UnknownFieldRowSchema = z.object({
  field: z.string(),
  firstSeenAt: IsoTimestamp,
  lastSeenAt: IsoTimestamp,
  batteries: z.number().int(),
  messages: z.number().int(),
  sampleValue: z.string(),
});

export const UnmatchedRowSchema = z.object({
  unmatchedId: Uuid,
  idValue: z.string(),
  firstSeenAt: IsoTimestamp,
  lastSeenAt: IsoTimestamp,
  messagesHeld: z.number().int(),
});

export const ConnectionSchema = z.object({
  settings: z.object({
    reportingWindowHours: z.number(),
    sendIntervalMinutes: z.number(),
    coveragePeriodDays: z.number(),
    gapLongerThanHours: z.number(),
  }),
  updated: z.object({ bms: IsoTimestamp, calculations: IsoTimestamp }),
  connectors: z.array(ConnectorRowSchema),
  batteries: z.array(BatteryReportingSchema),
  gaps: z.array(GapRowSchema),
  unknownFields: z.array(UnknownFieldRowSchema),
  unmatched: z.array(UnmatchedRowSchema),
  /** Batteries an unmatched ID can be linked to. Empty unless the user may link. */
  linkable: z.array(z.object({ batteryId: Uuid, factorySerial: z.string() })),
  bases: z.object({
    connectorLastSeen: BasisSchema,
    connectorReceived: BasisSchema,
    connectorRejected: BasisSchema,
    connectorCoverage: BasisSchema,
    lastSeen: BasisSchema,
    coverageDaily: BasisSchema,
    gaps: BasisSchema,
    unknownFields: BasisSchema,
    unmatched: BasisSchema,
  }),
  asOf: IsoTimestamp,
});
export type Connection = z.infer<typeof ConnectionSchema>;

export const LinkBodySchema = z.object({ batteryId: Uuid });

export const LinkResultSchema = z.object({
  idValue: z.string(),
  factorySerial: z.string(),
  messagesReplayed: z.number().int(),
  asOf: IsoTimestamp,
});
export type LinkResult = z.infer<typeof LinkResultSchema>;
