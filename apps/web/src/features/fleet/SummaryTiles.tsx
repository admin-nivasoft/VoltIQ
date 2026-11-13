import { AlertTriangle, BatteryCharging, Gauge, Hourglass, type LucideIcon } from 'lucide-react';
import type { FleetSummary } from '@ql/contracts';
import { ErrorState, LoadingState } from '../../components/ui/states';
import { StaleNotice } from '../../components/ui/StaleNotice';
import { formatPercent } from '../../lib/format';
import { useFleetSummary } from './api';

function Tile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-slate-300 bg-white p-4">
      <dt className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <Icon aria-hidden="true" className="h-5 w-5 text-slate-700" />
        {label}
      </dt>
      <dd className="mt-2 text-3xl font-semibold text-slate-900">{value}</dd>
      <dd className="mt-1 text-sm text-slate-700">{hint}</dd>
    </div>
  );
}

export function tilesFor(s: FleetSummary) {
  return [
    {
      icon: BatteryCharging,
      label: 'Packs in service',
      value: String(s.packsInService),
      hint: 'Packs currently assigned to you and in use',
    },
    {
      icon: Gauge,
      label: 'Average state of health',
      value: formatPercent(s.averageSohPct),
      hint:
        s.averageSohPct === null
          ? 'No packs in service yet'
          : 'Mean of the latest reading from each pack in service',
    },
    {
      icon: AlertTriangle,
      label: 'Active alerts',
      value: String(s.activeAlerts),
      hint: 'Open alerts nobody has acknowledged yet',
    },
    {
      icon: Hourglass,
      label: 'Packs nearing end of life',
      value: String(s.packsNearingEol),
      hint: 'Packs whose shortest remaining-life estimate is near the limit',
    },
  ];
}

export function SummaryTiles() {
  const q = useFleetSummary();
  if (q.isPending) return <LoadingState label="Loading fleet summary" />;
  if (q.data === undefined)
    return <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />;
  return (
    <section aria-labelledby="summary-title" className="space-y-3">
      <h2 id="summary-title" className="sr-only">
        Fleet summary
      </h2>
      <StaleNotice isError={q.isError} updatedAt={q.dataUpdatedAt} noun="fleet summary" />
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tilesFor(q.data).map((t) => (
          <Tile key={t.label} {...t} />
        ))}
      </dl>
    </section>
  );
}
