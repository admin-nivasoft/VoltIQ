import { useState } from 'react';
import type { NotificationLogEntry } from '@ql/contracts';
import { DeliveryBadge } from '../../components/ui/badges';
import { Pager } from '../../components/ui/Pager';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/states';
import { StaleNotice } from '../../components/ui/StaleNotice';
import { formatDateTime } from '../../lib/format';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { useNotificationLog } from './api';
import { CHANNEL_LABEL, describeDeliveryError } from './messages';

const PAGE_SIZE = 25;
const kind = (e: NotificationLogEntry) => (e.kind === 'alert' ? 'Alert' : 'Test message');

function Table({ items }: { items: NotificationLogEntry[] }) {
  return (
    <div
      role="region"
      aria-label="Delivery log table"
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-slate-300 bg-white"
    >
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Delivery attempts, newest first</caption>
        <thead className="border-b border-slate-300 bg-slate-100">
          <tr>
            {['When', 'Message', 'Channel', 'Result', 'Details'].map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-semibold text-slate-900">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((e) => (
            <tr key={e.id} className="border-b border-slate-200 last:border-0">
              <th scope="row" className="px-3 py-3 text-left align-top font-normal text-slate-900">
                <time dateTime={e.at}>{formatDateTime(e.at)}</time>
              </th>
              <td className="px-3 py-3 align-top text-slate-900">{kind(e)}</td>
              <td className="px-3 py-3 align-top text-slate-900">{CHANNEL_LABEL[e.channel]}</td>
              <td className="px-3 py-3 align-top">
                <DeliveryBadge status={e.status} attempt={e.attempt} />
              </td>
              <td className="px-3 py-3 align-top text-slate-800">
                {describeDeliveryError(e.error) || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cards({ items }: { items: NotificationLogEntry[] }) {
  return (
    <ul className="space-y-3">
      {items.map((e) => (
        <li key={e.id}>
          <article
            aria-label={`${kind(e)} by ${CHANNEL_LABEL[e.channel]}`}
            className="space-y-2 rounded-lg border border-slate-300 bg-white p-4"
          >
            <p className="font-semibold text-slate-900">{`${kind(e)} · ${CHANNEL_LABEL[e.channel]}`}</p>
            <p className="text-sm text-slate-700">
              <time dateTime={e.at}>{formatDateTime(e.at)}</time>
            </p>
            <DeliveryBadge status={e.status} attempt={e.attempt} />
            {e.error ? <p className="text-slate-800">{describeDeliveryError(e.error)}</p> : null}
          </article>
        </li>
      ))}
    </ul>
  );
}

export function LogSection() {
  const [page, setPage] = useState(1);
  const wide = useMediaQuery('(min-width: 768px)');
  const q = useNotificationLog(page, PAGE_SIZE);
  const total = q.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (q.data && !q.isPlaceholderData && page > lastPage) setPage(lastPage);

  return (
    <section aria-labelledby="log-title" className="space-y-4">
      <div>
        <h2 id="log-title" className="text-xl font-semibold text-slate-900">
          Delivery log
        </h2>
        <p className="text-slate-800">
          Every attempt to send a message to anyone in your company, newest first, including
          failures.
        </p>
      </div>
      {q.isPending ? (
        <LoadingState label="Loading the delivery log" />
      ) : q.data === undefined ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        <>
          <StaleNotice isError={q.isError} updatedAt={q.dataUpdatedAt} noun="delivery log" />
          {q.data.items.length === 0 ? (
            <EmptyState
              headingLevel={3}
              title="No deliveries yet"
              description="Messages sent to your team's channels will appear here."
            />
          ) : (
            <div
              aria-busy={q.isPlaceholderData}
              className={q.isPlaceholderData ? 'opacity-60' : ''}
            >
              {wide ? <Table items={q.data.items} /> : <Cards items={q.data.items} />}
            </div>
          )}
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPage={setPage}
            noun="delivery log"
          />
        </>
      )}
    </section>
  );
}
