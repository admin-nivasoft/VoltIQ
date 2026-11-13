import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { PackSummary } from '@ql/contracts';
import { TrendBadge, WarrantyBadge } from '../../components/ui/badges';
import { formatMonthsRange, formatPercent } from '../../lib/format';
import type { SortField } from './api';

export interface SortState {
  field: SortField;
  dir: 'asc' | 'desc';
}

export function RemainingLife({ life }: { life: PackSummary['remainingLife'] }) {
  if (!life) return <span className="text-slate-700">Not available</span>;
  return (
    <span className="flex flex-col">
      <span className="font-medium text-slate-900">
        {formatMonthsRange(life.monthsLow, life.monthsHigh)}
      </span>
      <span className="text-sm text-slate-700">
        {life.confidence === null
          ? 'Confidence not available'
          : `${Math.round(life.confidence * 100)}% confidence`}
      </span>
    </span>
  );
}

export function SohCell({ pack }: { pack: PackSummary }) {
  return (
    <span className="flex flex-col items-start gap-1">
      <span data-testid="soh-value" className="text-lg font-semibold text-slate-900">
        {formatPercent(pack.sohPct)}
      </span>
      <TrendBadge trend={pack.trend} />
    </span>
  );
}

export function PackIdentity({ pack }: { pack: PackSummary }) {
  return (
    <>
      <span className="font-semibold text-slate-900">{pack.serial}</span>
      {pack.status !== 'in_service' ? (
        <span className="block text-sm text-slate-700">
          {pack.status === 'retired' ? 'Retired' : 'Out of service'}
        </span>
      ) : null}
    </>
  );
}

const COLUMNS: { field: SortField; label: string }[] = [
  { field: 'sohPct', label: 'State of health and trend' },
  { field: 'remainingLife', label: 'Remaining life' },
  { field: 'warrantyStatus', label: 'Warranty' },
];

function SortHeader({
  field,
  label,
  sort,
  onSort,
}: {
  field: SortField;
  label: string;
  sort: SortState;
  onSort: (f: SortField) => void;
}) {
  const active = sort.field === field;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="px-3 py-2 text-left align-bottom"
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 font-semibold text-slate-900 hover:underline"
      >
        {label}
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      </button>
    </th>
  );
}

export function PackTable({
  packs,
  sort,
  onSort,
}: {
  packs: PackSummary[];
  sort: SortState;
  onSort: (f: SortField) => void;
}) {
  return (
    <div
      role="region"
      aria-label="Packs table"
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-slate-300 bg-white"
    >
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          Packs, with state of health, remaining life and warranty. Use the column buttons to sort.
        </caption>
        <thead className="border-b border-slate-300 bg-slate-100">
          <tr>
            <SortHeader field="serial" label="Serial" sort={sort} onSort={onSort} />
            <th
              scope="col"
              className="px-3 py-2 text-left align-bottom font-semibold text-slate-900"
            >
              Asset
            </th>
            {COLUMNS.map((c) => (
              <SortHeader key={c.field} {...c} sort={sort} onSort={onSort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {packs.map((p) => (
            <tr key={p.id} className="border-b border-slate-200 last:border-0">
              <th scope="row" className="px-3 py-3 text-left align-top font-normal">
                <PackIdentity pack={p} />
              </th>
              <td className="px-3 py-3 align-top text-slate-900">
                {p.assetId ?? <span className="text-slate-700">Not assigned</span>}
              </td>
              <td className="px-3 py-3 align-top">
                <SohCell pack={p} />
              </td>
              <td className="px-3 py-3 align-top">
                <RemainingLife life={p.remainingLife} />
              </td>
              <td className="px-3 py-3 align-top">
                <WarrantyBadge status={p.warrantyStatus} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
