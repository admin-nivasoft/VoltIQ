import { useQuery } from '@tanstack/react-query';
import { RadioTower } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { InlineNotification } from '../../../components/ui/inline-notification';
import { Skeleton } from '../../../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { apiFetch } from '../../../lib/api/client';
import { usePageTitle } from '../../../lib/usePageTitle';
import { ConnectionSchema, type Connection } from '../../types-connection';
import { NotRecorded, SourceTag, Updated, Working } from '../figure';
import { ago, dateTime, num, plural } from '../format';
import { BatteryReportingSection } from './BatteryReportingSection';
import { ConnectorPanel } from './ConnectorPanel';
import { BatteryLink, CONNECTION_KEY, SectionHeading } from './shared';
import { UnmatchedSection } from './UnmatchedSection';

// ---------------------------------------------------------------- gaps

function Gaps({ c }: { c: Connection }) {
  return (
    <section aria-labelledby="gaps" className="mb-8 scroll-mt-16">
      <SectionHeading id="gaps" title="Time with no data" updated={{ at: c.bases.gaps.calculatedAt, prefix: 'Worked out' }}>
        No data for more than {c.settings.gapLongerThanHours} hours, in the last {c.settings.coveragePeriodDays} days
        (example setting), longest first.
      </SectionHeading>
      {c.gaps.length ? (
        <>
          <div tabIndex={0} role="region" aria-label="Time with no data, scrollable" className="hidden overflow-x-auto border border-cds-border-subtle md:block">
            <Table>
              <caption className="sr-only">Time with no data, longest first</caption>
              <TableHeader>
                <tr>
                  <TableHead>Battery</TableHead>
                  <TableHead>No data from</TableHead>
                  <TableHead>Until</TableHead>
                  <TableHead numeric>Length (hours)</TableHead>
                  <TableHead>State</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {c.gaps.map((g) => (
                  <TableRow key={`${g.batteryId}${g.from}`}>
                    <TableCell><BatteryLink id={g.batteryId} serial={g.factorySerial} /></TableCell>
                    <TableCell className="whitespace-nowrap">{dateTime(g.from)}</TableCell>
                    <TableCell className="whitespace-nowrap">{g.ongoing ? 'Now' : dateTime(g.to)}</TableCell>
                    <TableCell numeric>{num(g.hours, 1)}</TableCell>
                    <TableCell>{g.ongoing ? 'Still no data' : 'Data came back'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="space-y-px md:hidden" aria-label="Time with no data, longest first">
            {c.gaps.map((g) => (
              <li key={`${g.batteryId}${g.from}`} className="bg-cds-layer-2 p-4 outline outline-1 outline-cds-border-subtle">
                <div className="flex items-center justify-between gap-2">
                  <BatteryLink id={g.batteryId} serial={g.factorySerial} />
                  <span className="tnum">{num(g.hours, 1)} hours</span>
                </div>
                <p className="mt-0.5 text-xs leading-4 text-cds-text-secondary">
                  {dateTime(g.from)} to {g.ongoing ? 'now' : dateTime(g.to)} · {g.ongoing ? 'Still no data' : 'Data came back'}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="border border-cds-border-subtle px-4 py-6">No battery went silent for long in this period.</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <SourceTag source="calculated" />
        <Working metricId="data_gaps" basis={c.bases.gaps} name="Time with no data" />
        <Updated at={c.bases.gaps.calculatedAt} prefix="Updated" />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- unknown fields

function UnknownFields({ c }: { c: Connection }) {
  const f = c.unknownFields;
  return (
    <section aria-labelledby="unknown" className="mb-8 scroll-mt-16">
      <SectionHeading id="unknown" title="Unrecognised data fields" updated={{ at: c.bases.unknownFields.calculatedAt, prefix: 'Worked out' }}>
        Data names the battery’s own system (BMS) sent that we do not recognise yet. We keep them with each message.
      </SectionHeading>
      {f.length ? (
        <>
          <div tabIndex={0} role="region" aria-label="Unrecognised data fields, scrollable" className="hidden overflow-x-auto border border-cds-border-subtle md:block">
            <Table>
              <caption className="sr-only">Unrecognised data fields</caption>
              <TableHeader>
                <tr>
                  <TableHead>Field</TableHead>
                  <TableHead>First seen</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead numeric>Messages</TableHead>
                  <TableHead numeric>Batteries</TableHead>
                  <TableHead>Sample value</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {f.map((u) => (
                  <TableRow key={u.field}>
                    <TableCell className="font-plex font-semibold">{u.field}</TableCell>
                    <TableCell className="whitespace-nowrap">{dateTime(u.firstSeenAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">{dateTime(u.lastSeenAt)}</TableCell>
                    <TableCell numeric>{num(u.messages)}</TableCell>
                    <TableCell numeric>{num(u.batteries)}</TableCell>
                    <TableCell className="font-plex">{u.sampleValue || <NotRecorded />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="space-y-px md:hidden" aria-label="Unrecognised data fields">
            {f.map((u) => (
              <li key={u.field} className="bg-cds-layer-2 p-4 outline outline-1 outline-cds-border-subtle">
                <p className="font-plex font-semibold">{u.field}</p>
                <p className="tnum mt-0.5 text-xs leading-4 text-cds-text-secondary">
                  {plural(u.messages, 'message')} · {plural(u.batteries, 'battery', 'batteries')} · sample{' '}
                  <span className="font-plex">{u.sampleValue}</span>
                </p>
                <p className="text-xs leading-4 text-cds-text-secondary">
                  First seen {ago(u.firstSeenAt)} · last seen {ago(u.lastSeenAt)}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="border border-cds-border-subtle px-4 py-6">The BMS has sent no data names we do not recognise.</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <SourceTag source="calculated" />
        <Working metricId="unknown_fields_received" basis={c.bases.unknownFields} name="Unrecognised data fields" />
        <Updated at={c.bases.unknownFields.calculatedAt} prefix="Updated" />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- page

function LoadingView() {
  return (
    <div aria-busy="true" aria-label="Loading the Data connection">
      <span className="sr-only" role="status">Loading the Data connection</span>
      <Skeleton className="mb-3 h-6 w-48" />
      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
      <Skeleton className="mb-3 h-6 w-64" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

export function ConnectionView() {
  usePageTitle('Data connection');
  const q = useQuery({
    queryKey: CONNECTION_KEY,
    queryFn: () => apiFetch('/connection', { schema: ConnectionSchema }),
  });
  const c = q.data;

  return (
    <div className="mx-auto max-w-[1312px] px-4 pb-16 pt-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-2xl leading-8 font-semibold tracking-[-0.01em]">Data connection</h1>
          <p className="mt-1 text-cds-text-secondary">
            <RadioTower aria-hidden="true" className="mr-1 inline h-4 w-4 align-text-bottom" />
            {c
              ? `${plural(c.connectors.length, 'connector')} · ${plural(c.batteries.length, 'battery', 'batteries')} registered`
              : ' '}
          </p>
        </div>
        {c ? (
          <div className="flex flex-col items-start gap-0.5 sm:items-end">
            <Updated at={c.updated.bms} prefix="BMS data received" />
            <Updated at={c.updated.calculations} prefix="Figures updated" />
          </div>
        ) : null}
      </div>

      {q.isPending ? <LoadingView /> : null}
      {q.isError ? (
        <InlineNotification
          kind="error"
          title="The Data connection could not be loaded"
          action={<Button size="sm" variant="tertiary" onClick={() => void q.refetch()}>Try again</Button>}
        >
          Check your connection, then try again.
        </InlineNotification>
      ) : null}
      {c ? (
        <>
          <ConnectorPanel c={c} />
          <BatteryReportingSection c={c} />
          <Gaps c={c} />
          <UnknownFields c={c} />
          <UnmatchedSection c={c} />
        </>
      ) : null}
    </div>
  );
}
