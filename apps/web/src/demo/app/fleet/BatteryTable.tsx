import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, FileWarning, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { InlineNotification } from '../../../components/ui/inline-notification';
import { Skeleton } from '../../../components/ui/skeleton';
import { SortableHead, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { apiFetch } from '../../../lib/api/client';
import { qs } from '../../../lib/api/query';
import { useDebounced } from '../../../lib/useDebounced';
import { BatteryPageSchema, type BatteryRow, type Settings, type Source } from '../../types';
import { NotRecorded, SourceTag, Working } from '../figure';
import { ago, dateTime, num } from '../format';
import { SeverityTag } from '../severity';

type SortField = 'serial' | 'soh' | 'cycles' | 'coverage' | 'lastSeen' | 'warnings';
const PAGE_SIZE = 12;

const COLUMNS: {
  field: SortField | 'holder';
  label: string;
  unit?: string;
  numeric?: boolean;
  source?: Source;
  metricId?: string;
}[] = [
  { field: 'serial', label: 'Battery' },
  { field: 'holder', label: 'Holder, site' },
  { field: 'soh', label: 'Health (reported by BMS)', unit: '%', numeric: true, source: 'bms', metricId: 'soh_reported_pct' },
  { field: 'cycles', label: 'Cycles (reported by BMS)', numeric: true, source: 'bms', metricId: 'cycle_count_reported' },
  { field: 'coverage', label: 'Data received', unit: '%', numeric: true, source: 'calculated', metricId: 'data_coverage_pct' },
  { field: 'lastSeen', label: 'Last data', source: 'calculated', metricId: 'last_seen_at' },
  { field: 'warnings', label: 'Open warnings' },
];

const pctOr = (v: number | null) => (v === null ? <NotRecorded /> : num(v, 1));

function BatteryLink({ r }: { r: BatteryRow }) {
  return (
    <Link to={`/batteries/${r.battery.batteryId}`} className="font-semibold text-cds-interactive hover:underline">
      {r.battery.factorySerial ?? r.battery.bmsId}
    </Link>
  );
}

function Warnings({ r }: { r: BatteryRow }) {
  if (!r.openWarnings || !r.worstSeverity) return <span className="text-cds-text-helper">None</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <SeverityTag severity={r.worstSeverity} />
      {r.openWarnings > 1 ? <span className="tnum text-cds-text-secondary">+{r.openWarnings - 1}</span> : null}
    </span>
  );
}

function LastSeen({ at }: { at: string | null }) {
  return at ? (
    <time dateTime={at} title={dateTime(at)}>
      {ago(at)}
    </time>
  ) : (
    <NotRecorded>Never reported</NotRecorded>
  );
}

/** The whole fleet as a dense, sortable table. On a phone each row becomes a card. */
export function BatteryTable({ settings }: { settings: Settings }) {
  const [sort, setSort] = useState<{ field: SortField; dir: 'asc' | 'desc' }>({ field: 'warnings', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 250);
  const list = useQuery({
    queryKey: ['demo', 'batteries', sort, page, q],
    queryFn: () =>
      apiFetch(`/batteries${qs({ page, pageSize: PAGE_SIZE, sort: `${sort.field}:${sort.dir}`, q })}`, {
        schema: BatteryPageSchema,
      }),
    placeholderData: keepPreviousData,
  });
  const onSort = (field: SortField) => {
    setPage(1);
    setSort((s) => (s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: field === 'serial' ? 'asc' : 'desc' }));
  };
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const last = Math.min(total, page * PAGE_SIZE);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 bg-cds-layer px-4 py-2">
        <label className="relative flex w-full min-w-0 items-center sm:w-auto sm:flex-1 sm:max-w-sm">
          <span className="sr-only">Search batteries</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 h-4 w-4 text-cds-text-secondary" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            maxLength={100}
            placeholder="Search by ID, holder, site or model"
            className="h-10 w-full border-b border-cds-border-strong bg-cds-layer-2 pl-9 pr-3 text-sm placeholder:text-cds-text-helper"
          />
        </label>
        <p className="text-xs leading-4 text-cds-text-secondary">
          Data received: last {settings.coveragePeriodDays} days (example setting)
        </p>
      </div>

      {list.isError ? (
        <InlineNotification kind="error" title="The battery list could not be loaded" className="mt-2"
          action={<Button size="sm" variant="tertiary" onClick={() => void list.refetch()}>Try again</Button>}>
          Check your connection, then try again.
        </InlineNotification>
      ) : null}

      {/* Table: tablet and up */}
      <div className="hidden max-h-[560px] overflow-auto border-x border-cds-border-subtle md:block">
        <Table aria-busy={list.isFetching}>
          <caption className="sr-only">
            Batteries, sorted by {COLUMNS.find((c) => c.field === sort.field)!.label} {sort.dir === 'asc' ? 'ascending' : 'descending'}
          </caption>
          <TableHeader>
            <tr>
              {COLUMNS.map((c) => {
                const field = c.field;
                return field === 'holder' ? (
                  <TableHead key={field}>{c.label}</TableHead>
                ) : (
                  <SortableHead key={field} active={sort.field === field} dir={sort.dir} onSort={() => onSort(field)} numeric={c.numeric}>
                    {c.label}
                    {c.unit ? ` (${c.unit})` : ''}
                  </SortableHead>
                );
              })}
            </tr>
            <tr className="bg-cds-layer">
              {COLUMNS.map((c) => (
                <td key={c.field} className={c.numeric ? 'px-4 pb-1.5 text-right' : 'px-4 pb-1.5'}>
                  {c.source && c.metricId ? (
                    <span className={`inline-flex items-center gap-1 ${c.numeric ? 'flex-row-reverse' : ''}`}>
                      <SourceTag source={c.source} />
                      <Working metricId={c.metricId} name={c.label} />
                    </span>
                  ) : c.field === 'warnings' ? (
                    <SourceTag source="calculated" />
                  ) : (
                    <SourceTag source="registered" />
                  )}
                </td>
              ))}
            </tr>
          </TableHeader>
          <TableBody>
            {list.isPending
              ? Array.from({ length: 6 }, (_, i) => (
                  <TableRow key={i}>
                    {COLUMNS.map((c) => (
                      <TableCell key={c.field}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : list.data?.items.map((r) => (
                  <TableRow key={r.battery.batteryId}>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <BatteryLink r={r} />
                        {!r.hasBirthRecord ? (
                          <span className="inline-flex items-center gap-1 text-xs text-cds-text-secondary">
                            <FileWarning aria-hidden="true" className="h-3.5 w-3.5" />
                            No factory record
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs leading-4 text-cds-text-helper">{r.battery.bmsId}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.holder ? (
                        <>
                          <div>{r.holder}</div>
                          <div className="text-xs leading-4 text-cds-text-helper">{r.site}</div>
                        </>
                      ) : (
                        <NotRecorded>Deployment not recorded</NotRecorded>
                      )}
                    </TableCell>
                    <TableCell numeric>{pctOr(r.sohReportedPct)}</TableCell>
                    <TableCell numeric>{r.cyclesReported === null ? <NotRecorded /> : num(r.cyclesReported)}</TableCell>
                    <TableCell numeric>{pctOr(r.coveragePct)}</TableCell>
                    <TableCell className="whitespace-nowrap"><LastSeen at={r.lastSeenAt} /></TableCell>
                    <TableCell><Warnings r={r} /></TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      {/* Cards: phone */}
      <ul className="space-y-px md:hidden" aria-busy={list.isFetching} aria-label="Batteries">
        {list.isPending
          ? Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="bg-cds-layer p-4">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="mt-3 h-4 w-full" />
              </li>
            ))
          : list.data?.items.map((r) => (
              <li key={r.battery.batteryId} className="bg-cds-layer p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <BatteryLink r={r} />
                    <p className="text-xs leading-4 text-cds-text-helper">
                      {r.battery.bmsId} · {r.holder ? `${r.holder}, ${r.site}` : 'Deployment not recorded'}
                    </p>
                    {!r.hasBirthRecord ? (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs text-cds-text-secondary">
                        <FileWarning aria-hidden="true" className="h-3.5 w-3.5" /> No factory record
                      </p>
                    ) : null}
                  </div>
                  <Warnings r={r} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                  <div>
                    <dt className="text-xs leading-4 text-cds-text-secondary">Health (reported by BMS)</dt>
                    <dd className="tnum">{r.sohReportedPct === null ? <NotRecorded /> : `${num(r.sohReportedPct, 1)}%`}</dd>
                  </div>
                  <div>
                    <dt className="text-xs leading-4 text-cds-text-secondary">Cycles (reported by BMS)</dt>
                    <dd className="tnum">{r.cyclesReported === null ? <NotRecorded /> : num(r.cyclesReported)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs leading-4 text-cds-text-secondary">Data received, worked out by us</dt>
                    <dd className="tnum">{r.coveragePct === null ? <NotRecorded /> : `${num(r.coveragePct, 1)}%`}</dd>
                  </div>
                  <div>
                    <dt className="text-xs leading-4 text-cds-text-secondary">Last data</dt>
                    <dd><LastSeen at={r.lastSeenAt} /></dd>
                  </div>
                </dl>
              </li>
            ))}
      </ul>

      {list.data && list.data.items.length === 0 ? (
        <p className="border border-cds-border-subtle bg-cds-layer-2 px-4 py-6 text-center">
          No battery matches “{q}”. Check the ID, or clear the search to see all batteries.
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2 border border-t-0 border-cds-border-subtle bg-cds-layer px-4">
        <p className="tnum py-2 text-xs leading-4 text-cds-text-secondary" aria-live="polite">
          {total ? `${num(first)}–${num(last)} of ${num(total)} batteries` : ' '}
        </p>
        <div className="flex">
          <Button variant="ghost" size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="text-cds-text-primary">
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Next page" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="text-cds-text-primary">
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
