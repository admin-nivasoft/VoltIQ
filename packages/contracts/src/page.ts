import { z, IsoTimestamp } from './common.js';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

/** Query params shared by every list endpoint. `sort` is checked per endpoint against an allow-list. */
export const PageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sort: z.string().max(64).optional(),
});
export type PageQuery = z.infer<typeof PageQuerySchema>;

export const pageOf = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
    asOf: IsoTimestamp,
  });
export type Page<T> = { items: T[]; total: number; page: number; pageSize: number; asOf: string };
