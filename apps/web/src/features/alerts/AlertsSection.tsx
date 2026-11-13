import { useRef, useState } from 'react';
import type { Alert } from '@ql/contracts';
import { ApiError } from '../../lib/api/client';
import { EmptyState, ErrorState, LoadingState, describeError } from '../../components/ui/states';
import { Pager } from '../../components/ui/Pager';
import { StaleNotice } from '../../components/ui/StaleNotice';
import { AlertCard } from './AlertCard';
import { useAcknowledge, useAlerts, type StatusFilter } from './api';

const PAGE_SIZE = 10;
const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
];

function ackError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409)
      return 'That alert has already been resolved, so it cannot be acknowledged.';
    if (err.status === 404) return 'That alert is no longer available.';
    if (err.status === 403) return "You don't have permission to acknowledge alerts.";
  }
  return `We couldn't acknowledge the alert. ${describeError(err)}`;
}

export function AlertsSection() {
  const [status, setStatus] = useState<StatusFilter>('open');
  const [page, setPage] = useState(1);
  const q = useAlerts({ status, page, pageSize: PAGE_SIZE });
  const ack = useAcknowledge();
  const heading = useRef<HTMLHeadingElement>(null);
  const [announcement, setAnnouncement] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  // If the list shrinks under you (the last alert on page 2 was acknowledged), step back instead of
  // sitting on an empty page that has no pager.
  const lastPage = q.data ? Math.max(1, Math.ceil(q.data.total / PAGE_SIZE)) : 1;
  if (q.data && !q.isPlaceholderData && page > lastPage) setPage(lastPage);

  const change = (next: { status?: StatusFilter; page?: number }) => {
    if (next.status !== undefined) setStatus(next.status);
    setPage(next.page ?? 1);
    setFailure(null);
    setAnnouncement('');
  };

  function acknowledge(a: Alert) {
    setFailure(null);
    setPendingId(a.id);
    ack.mutate(a.id, {
      onSuccess: () => {
        // A running number makes every message different, so two alerts with the same title are both announced.
        setCount((n) => n + 1);
        setAnnouncement(`Alert acknowledged: ${a.title}, pack ${a.packSerial}.`);
        // The button is gone once the list refreshes, so bring focus back to the section.
        heading.current?.focus();
      },
      onError: (err) => setFailure(ackError(err)),
      onSettled: () => setPendingId(null),
    });
  }

  const stale = q.isPlaceholderData; // old rows are still on screen while the new ones load
  const total = q.data?.total ?? 0;
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);

  return (
    <section aria-labelledby="alerts-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2
          id="alerts-title"
          ref={heading}
          tabIndex={-1}
          className="text-xl font-semibold text-slate-900 focus:outline-none"
        >
          Alerts
        </h2>
        <div className="flex items-center gap-2">
          <label htmlFor="alert-status" className="font-medium text-slate-900">
            Show
          </label>
          <select
            id="alert-status"
            value={status}
            onChange={(e) => change({ status: e.target.value as StatusFilter })}
            className="min-h-11 rounded-md border border-slate-500 bg-white px-3 text-slate-900"
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Always on the page, so an acknowledgement is announced to screen readers. */}
      <p role="status" className="sr-only" data-count={count}>
        {announcement}
      </p>
      {failure ? (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900">
          {failure}
        </p>
      ) : null}

      {q.isPending ? (
        <LoadingState label="Loading alerts" />
      ) : q.data === undefined ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        <>
          <StaleNotice isError={q.isError} updatedAt={q.dataUpdatedAt} noun="alerts" />
          {/* Stable text: it is announced when the filter or page changes, not on every poll. */}
          {total > 0 ? (
            <p
              role="status"
              className="text-slate-800"
            >{`Showing ${first}–${last} of ${total} alerts`}</p>
          ) : null}
          {q.data.items.length === 0 ? (
            <EmptyState
              headingLevel={3}
              title={status === 'open' ? 'No open alerts' : 'No alerts to show'}
              description={
                status === 'open'
                  ? 'Nothing needs your attention right now.'
                  : 'Try a different filter.'
              }
            />
          ) : (
            <ul aria-busy={stale} className={`space-y-3 ${stale ? 'opacity-60' : ''}`}>
              {q.data.items.map((a) => (
                <li key={a.id}>
                  <AlertCard
                    alert={a}
                    pending={ack.isPending || stale}
                    busyId={pendingId}
                    onAcknowledge={() => acknowledge(a)}
                  />
                </li>
              ))}
            </ul>
          )}
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPage={(p) => change({ page: p })}
            noun="alerts"
          />
        </>
      )}
    </section>
  );
}
