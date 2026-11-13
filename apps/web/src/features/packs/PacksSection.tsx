import { Search } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/states';
import { Pager } from '../../components/ui/Pager';
import { StaleNotice } from '../../components/ui/StaleNotice';
import { useDebounced } from '../../lib/useDebounced';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { usePacks, type PackParams, type SortField } from './api';
import { PackCards } from './PackCards';
import { PackTable, type SortState } from './PackTable';

const PAGE_SIZE = 25;
export const DESKTOP_QUERY = '(min-width: 768px)';

const SORT_OPTIONS: { value: PackParams['sort']; label: string }[] = [
  { value: 'serial:asc', label: 'Serial (A to Z)' },
  { value: 'serial:desc', label: 'Serial (Z to A)' },
  { value: 'sohPct:asc', label: 'State of health (lowest first)' },
  { value: 'sohPct:desc', label: 'State of health (highest first)' },
  { value: 'remainingLife:asc', label: 'Remaining life (shortest first)' },
  { value: 'remainingLife:desc', label: 'Remaining life (longest first)' },
  { value: 'warrantyStatus:asc', label: 'Warranty (expired first)' },
  { value: 'warrantyStatus:desc', label: 'Warranty (active first)' },
];

export function PacksSection() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ field: 'serial', dir: 'asc' });
  const [page, setPage] = useState(1);
  const term = useDebounced(search, 300);
  const q = usePacks({ q: term, sort: `${sort.field}:${sort.dir}`, page, pageSize: PAGE_SIZE });

  // A new search term starts again from page 1, once the term has settled (not on every keystroke).
  const [lastTerm, setLastTerm] = useState(term);
  if (term !== lastTerm) {
    setLastTerm(term);
    setPage(1);
  }
  // If the list shrinks under you, step back instead of sitting on an empty page with no pager.
  const lastPage = q.data ? Math.max(1, Math.ceil(q.data.total / PAGE_SIZE)) : 1;
  if (q.data && !q.isPlaceholderData && page > lastPage) setPage(lastPage);

  const onSort = (field: SortField) => {
    setSort((s) => ({ field, dir: s.field === field && s.dir === 'asc' ? 'desc' : 'asc' }));
    setPage(1);
  };

  const sortLabel =
    SORT_OPTIONS.find((o) => o.value === `${sort.field}:${sort.dir}`)?.label.toLowerCase() ?? '';
  const stale = q.isPlaceholderData; // old rows are still on screen while the new ones load
  const total = q.data?.total ?? 0;
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);

  return (
    <section aria-labelledby="packs-title" className="space-y-4">
      <h2 id="packs-title" className="text-xl font-semibold text-slate-900">
        Packs
      </h2>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="pack-search" className="mb-1 block font-medium text-slate-900">
            Search packs
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-600"
            />
            <input
              id="pack-search"
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              aria-describedby="pack-search-help"
              maxLength={100}
              className="min-h-11 w-full rounded-md border border-slate-500 bg-white py-2 pl-10 pr-3 text-slate-900"
            />
          </div>
          <p id="pack-search-help" className="mt-1 text-sm text-slate-700">
            Serial, asset ID or specification.
          </p>
        </div>
        {!isDesktop ? (
          <div>
            <label htmlFor="pack-sort" className="mb-1 block font-medium text-slate-900">
              Sort by
            </label>
            <select
              id="pack-sort"
              value={`${sort.field}:${sort.dir}`}
              onChange={(e) => {
                const [field, dir] = e.target.value.split(':') as [SortField, 'asc' | 'desc'];
                setSort({ field, dir });
                setPage(1);
              }}
              className="min-h-11 w-full rounded-md border border-slate-500 bg-white px-3 text-slate-900 sm:w-auto"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {q.isPending ? (
        <LoadingState label="Loading packs" />
      ) : q.data === undefined ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        <>
          {/* Stable text: announced when the search, sort or page changes, not on every poll. */}
          {total > 0 ? (
            <p
              role="status"
              className="text-slate-800"
            >{`Showing ${first}–${last} of ${total} packs, sorted by ${sortLabel}`}</p>
          ) : null}
          <StaleNotice isError={q.isError} updatedAt={q.dataUpdatedAt} noun="packs" />
          {q.data.items.length === 0 ? (
            <EmptyState
              headingLevel={3}
              title={term.trim() ? `No packs match “${term.trim()}”` : 'No packs yet'}
              description={
                term.trim()
                  ? 'Check the spelling, or search by serial, asset ID or specification.'
                  : 'Packs assigned to you will appear here.'
              }
              action={
                term.trim() ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="inline-flex min-h-11 items-center rounded-md border border-slate-500 bg-white px-4 font-medium text-slate-900 hover:bg-slate-100"
                  >
                    Clear search
                  </button>
                ) : undefined
              }
            />
          ) : isDesktop ? (
            <div aria-busy={stale} className={stale ? 'opacity-60' : ''}>
              <PackTable packs={q.data.items} sort={sort} onSort={onSort} />
            </div>
          ) : (
            <div aria-busy={stale} className={stale ? 'opacity-60' : ''}>
              <PackCards packs={q.data.items} />
            </div>
          )}
          <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} noun="packs" />
        </>
      )}
    </section>
  );
}
