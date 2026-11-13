import { describe, expect, it } from 'vitest';
import { escapeLike, paginate, parseSort, QueryError } from './query.ts';

const allow = ['serial', 'sohPct'] as const;

describe('parseSort', () => {
  it('defaults when absent', () =>
    expect(parseSort(undefined, allow, { field: 'serial', dir: 'asc' })).toEqual({
      field: 'serial',
      dir: 'asc',
    }));
  it('parses field:dir and field alone', () => {
    expect(parseSort('sohPct:desc', allow, { field: 'serial', dir: 'asc' })).toEqual({
      field: 'sohPct',
      dir: 'desc',
    });
    expect(parseSort('sohPct', allow, { field: 'serial', dir: 'asc' })).toEqual({
      field: 'sohPct',
      dir: 'asc',
    });
  });
  it.each([
    'password',
    'serial;DROP TABLE packs',
    'serial:sideways',
    'SERIAL',
    '',
    ':asc',
    'serial:asc:x',
    '__proto__',
  ])('rejects %j', (bad) =>
    expect(() => parseSort(bad, allow, { field: 'serial', dir: 'asc' })).toThrow(QueryError),
  );
});

describe('escapeLike', () => {
  it('escapes %, _ and the escape character', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
    expect(escapeLike('plain')).toBe('plain');
  });
});

describe('paginate', () => {
  it('slices a page and reports the total', () => {
    const rows = Array.from({ length: 10 }, (_, i) => i);
    expect(paginate(rows, 2, 4)).toEqual({ items: [4, 5, 6, 7], total: 10 });
    expect(paginate(rows, 4, 4)).toEqual({ items: [], total: 10 });
  });
});
