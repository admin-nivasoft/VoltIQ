import { CheckCircle2, PauseCircle } from 'lucide-react';
import { Tag } from '../../../components/ui/tag';
import { Tile } from '../../../components/ui/tile';
import type { Connection } from '../../types-connection';
import { NotRecorded, SourceTag, Updated, Working } from '../figure';
import { ago, dateTime, num } from '../format';
import { SectionHeading } from './shared';

type Row = Connection['connectors'][number];

function Stat({ label, metricId, basis, source = 'calculated', children }: {
  label: string;
  metricId: string;
  basis: Connection['bases']['connectorReceived'];
  source?: 'calculated';
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-xs leading-4 text-cds-text-secondary">
        {label}
        <Working metricId={metricId} basis={basis} name={label} />
      </dt>
      <dd><span className="tnum block text-xl leading-7">{children}</span>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <SourceTag source={source} />
        <Updated at={basis.calculatedAt} prefix="Updated" />
      </div></dd>
    </div>
  );
}

function ConnectorCard({ r, c }: { r: Row; c: Connection }) {
  const active = r.status === 'active';
  const b = c.bases;
  return (
    <Tile>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{r.name}</h3>
          <p className="text-xs leading-4 text-cds-text-secondary">{r.protocol} · created {dateTime(r.createdAt)}</p>
        </div>
        {active ? (
          <Tag tone="success"><CheckCircle2 aria-hidden="true" />Active</Tag>
        ) : (
          <Tag tone="neutral"><PauseCircle aria-hidden="true" />Disabled</Tag>
        )}
      </div>
      <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Stat label="Last message" metricId="connector_last_seen_at" basis={b.connectorLastSeen}>
          {r.lastMessageAt ? (
            <time dateTime={r.lastMessageAt} title={dateTime(r.lastMessageAt)}>{ago(r.lastMessageAt)}</time>
          ) : (
            <NotRecorded>Never</NotRecorded>
          )}
        </Stat>
        <Stat label="Data received" metricId="connector_data_coverage_pct" basis={b.connectorCoverage}>
          {r.coveragePct === null ? <NotRecorded /> : `${num(r.coveragePct, 1)}%`}
        </Stat>
        <Stat label="Messages in 24 hours" metricId="connector_messages_received" basis={b.connectorReceived}>
          {num(r.messages24h)}
        </Stat>
        <Stat label="Rejected in 24 hours" metricId="connector_messages_rejected" basis={b.connectorRejected}>
          {num(r.rejected24h)}
        </Stat>
      </dl>
      {r.rejectReasons.length ? (
        <div className="mt-4">
          <p className="text-xs font-semibold leading-4 text-cds-text-secondary">Why messages were rejected</p>
          <ul className="mt-1 divide-y divide-cds-border-subtle border-y border-cds-border-subtle">
            {r.rejectReasons.map((x) => (
              <li key={x.reason} className="flex items-center justify-between gap-2 py-1.5">
                <span>{x.reason}</span>
                <span className="tnum">{num(x.count)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs leading-4 text-cds-text-helper">Rejected messages are still kept as received.</p>
        </div>
      ) : (
        <p className="mt-4 text-cds-text-secondary">No messages were rejected in the last 24 hours.</p>
      )}
    </Tile>
  );
}

export function ConnectorPanel({ c }: { c: Connection }) {
  return (
    <section aria-labelledby="connectors" className="mb-8 scroll-mt-16">
      <SectionHeading id="connectors" title="Connectors">
        How battery messages reach us. This page only shows them. Connections are set up outside the demo.
      </SectionHeading>
      {c.connectors.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {c.connectors.map((r) => (
            <ConnectorCard key={r.connectorId} r={r} c={c} />
          ))}
        </div>
      ) : (
        <p className="border border-cds-border-subtle px-4 py-6">No connection is set up yet, so no battery data can arrive.</p>
      )}
    </section>
  );
}
