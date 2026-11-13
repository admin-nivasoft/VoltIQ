/** A request the data layer refuses (bad sort key, bad page). Routes map it to a 400. */
export class QueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryError';
  }
}

export interface Sort<F extends string> {
  field: F;
  dir: 'asc' | 'desc';
}

/**
 * `sort` is `field` or `field:asc|desc`, checked against a per-endpoint allow-list.
 * The returned field is always one of the allow-listed constants, never raw input.
 */
export function parseSort<F extends string>(
  raw: string | undefined,
  allowed: readonly F[],
  fallback: Sort<F>,
): Sort<F> {
  if (raw === undefined) return fallback;
  const parts = raw.split(':');
  if (parts.length > 2) throw new QueryError('Invalid sort');
  const [field, dir = 'asc'] = parts;
  const match = allowed.find((a) => a === field);
  if (match === undefined || (dir !== 'asc' && dir !== 'desc'))
    throw new QueryError('Invalid sort');
  return { field: match, dir };
}

/** Escapes LIKE wildcards so search input is matched literally (use with ESCAPE '\'). */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function paginate<T>(
  rows: readonly T[],
  page: number,
  pageSize: number,
): { items: T[]; total: number } {
  const start = (page - 1) * pageSize;
  return { items: rows.slice(start, start + pageSize), total: rows.length };
}
