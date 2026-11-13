import type { Alert } from '@ql/contracts';
import { AlertStatusBadge, SeverityBadge } from '../../components/ui/badges';
import { Can } from '../../components/Can';
import { formatDateTime } from '../../lib/format';

export function AlertCard({
  alert,
  onAcknowledge,
  pending,
  busyId,
}: {
  alert: Alert;
  onAcknowledge: () => void;
  pending: boolean;
  busyId: string | null;
}) {
  return (
    <article
      aria-labelledby={`alert-${alert.id}`}
      className="space-y-3 rounded-lg border border-slate-300 bg-white p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={alert.severity} />
        <AlertStatusBadge status={alert.status} />
      </div>
      <div>
        <h3 id={`alert-${alert.id}`} className="text-lg font-semibold text-slate-900">
          {alert.title}
        </h3>
        <p className="text-sm text-slate-700">
          Pack <span className="font-medium">{alert.packSerial}</span> · Raised{' '}
          <time dateTime={alert.createdAt}>{formatDateTime(alert.createdAt)}</time>
        </p>
      </div>
      <p className="text-slate-800">{alert.description}</p>
      <p className="text-slate-900">
        <span className="font-semibold">Recommended action: </span>
        {alert.recommendedAction}
      </p>
      {alert.acknowledgedAt && alert.acknowledgedBy ? (
        <p className="text-sm text-slate-700">
          Acknowledged by {alert.acknowledgedBy} on{' '}
          <time dateTime={alert.acknowledgedAt}>{formatDateTime(alert.acknowledgedAt)}</time>
        </p>
      ) : null}
      {alert.status === 'open' ? (
        <Can permission="alerts.acknowledge">
          <button
            type="button"
            aria-disabled={pending}
            onClick={() => {
              if (!pending) onAcknowledge();
            }}
            className="inline-flex min-h-11 items-center rounded-md bg-blue-700 px-4 font-medium text-white hover:bg-blue-800 aria-disabled:opacity-70"
          >
            {busyId === alert.id ? 'Acknowledging…' : 'Acknowledge'}
            <span className="sr-only">{`: ${alert.title}`}</span>
          </button>
        </Can>
      ) : null}
    </article>
  );
}
