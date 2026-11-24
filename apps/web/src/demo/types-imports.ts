// Response shapes for the birth data import screen (demo only). The screen validates every response
// against these, as the real app does with contracts.
import { IsoTimestamp, z } from '@ql/contracts';
import { BasisSchema } from './types';

export const ImportKindSchema = z.enum(['birth', 'test', 'lot', 'dispatch']);
export type ImportKind = z.infer<typeof ImportKindSchema>;

/** The text of a sample file travels with it, so the screen can send it back to preview or import. */
export const SampleFileSchema = z.object({
  fileName: z.string(),
  kind: ImportKindSchema,
  description: z.string(),
  csv: z.string(),
});
export type SampleFileDto = z.infer<typeof SampleFileSchema>;

export const ImportHistoryEntrySchema = z.object({
  importId: z.string(),
  fileName: z.string(),
  kind: ImportKindSchema,
  by: z.string(),
  at: IsoTimestamp,
  rowsLoaded: z.number().int(),
  rowsRejected: z.number().int(),
  rowsUnmatched: z.number().int(),
  unknownColumns: z.array(z.string()),
});
export type ImportHistoryEntryDto = z.infer<typeof ImportHistoryEntrySchema>;

export const ImportsListSchema = z.object({
  sampleFiles: z.array(SampleFileSchema),
  history: z.array(ImportHistoryEntrySchema),
  asOf: IsoTimestamp,
});
export type ImportsList = z.infer<typeof ImportsListSchema>;

/** The body of both POST /imports/preview and POST /imports. */
export const ImportBodySchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  csv: z.string().min(1).max(1_000_000),
});
export type ImportBody = z.infer<typeof ImportBodySchema>;

export const RowStatusSchema = z.enum(['loaded', 'rejected', 'unmatched']);
export type RowStatus = z.infer<typeof RowStatusSchema>;

export const ImportRowSchema = z.object({
  /** Line number in the file, counting the header as line 1. */
  line: z.number().int(),
  /** What identifies the row: a factory serial or a lot id. null when the file gave none. */
  key: z.string().nullable(),
  status: RowStatusSchema,
  /** Why a row was rejected or left unmatched. null for loaded rows. */
  reason: z.string().nullable(),
  unmatchedReason: z.enum(['no_match', 'several_matches']).nullable(),
  /** What loading the row does, for loaded rows. */
  effect: z.string().nullable(),
});
export type ImportRow = z.infer<typeof ImportRowSchema>;

export const ImportPreviewSchema = z.object({
  fileName: z.string(),
  kind: ImportKindSchema,
  counts: z.object({ loaded: z.number().int(), rejected: z.number().int(), unmatched: z.number().int() }),
  rows: z.array(ImportRowSchema),
  /** Columns the platform does not recognise: stored in the record's extra fields, never dropped. */
  unknownColumns: z.array(z.string()),
  /** What loading would change (preview) or changed (result). */
  effects: z.object({
    birthRecordsAdded: z.number().int(),
    batteriesCreated: z.number().int(),
    unmatchedIdsResolved: z.array(z.string()),
  }),
  bases: z.object({ loaded: BasisSchema, rejected: BasisSchema, unmatched: BasisSchema }),
  calculatedAt: IsoTimestamp,
  asOf: IsoTimestamp,
});
export type ImportPreview = z.infer<typeof ImportPreviewSchema>;

export const ImportResultSchema = ImportPreviewSchema.extend({ entry: ImportHistoryEntrySchema });
export type ImportResult = z.infer<typeof ImportResultSchema>;
