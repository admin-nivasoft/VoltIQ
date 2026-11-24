import { CheckCircle2, CircleSlash, Clock } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Tag } from '../../../components/ui/tag';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import type { BatteryReporting, Connection, ReportingStatus } from '../../types-connection';
import { NotRecorded, SourceTag, Updated, Working } from '../figure';
import { ago, dateTime, num } from '../format';
import { BatteryLink, SectionHeading } from './shared';

const PAGE = 15;
type Filter = 'all' | ReportingStatus;

export function StatusTag({ status, hours }: { status: ReportingStatus; hours: number }) {
  if (status === 'reporting') return <Tag tone="success"><CheckCircle2 aria-hidden="true" />Reporting</Tag>;
  if (status === 'quiet') return <Tag tone="medium"><Clock aria-hidden="true" />No data for {hours} hours</Tag>;
  return <Tag tone="neutral"><CircleSlash aria-hidden="true" />Never reported</Tag>;
}

const weekday = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
const fullDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Seven days as numbers: day name above, percentage below. Never colour alone. */
function DayRow({ b }: { b: BatteryReporting }) {
  if (b.status === 'never' || !b.days.length) return <NotRecorded>Never reported</NotRecorded>;
  return (
    <ul className="tnum flex gap-1 text-xs leading-4" aria-label={`Daily coverage for ${b.factorySerial}`}>
      {b.days.map((d) => (
        <li key={d.day} className="w-10 text-center" title={`${fullDay(d.day)}: ${d.received} of ${d.expected} messages`}>
          <span className="block text-cds-text-helper">{weekday(d.day)}</span>
          <span className="block">{d.pct === null ? 'n/a' : `${num(d.pct)}%`}</span>
        </li>
      ))}
    </ul>
  );
}

const gapText = (h: number, limit: number) => (h > limit ? `${num(h, 1)} h` : `None over ${limit} hours`);

export function BatteryReportingSection({ c }: { c: Connection }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE);
  const w = c.settings.reportingWindowHours;
  const counts = {
    all: c.batteries.length,
    reporting: c.batteries.filter((b) => b.status === 'reporting').length,
    quiet: c.batteries.filter((b) => b.status === 'quiet').length,
    never: c.batteries.filter((b) => b.status === 'never').length,
  };
  const rows = c.batteries.filter((b) => filter === 'all' || b.status === filter);
  const visible = rows.slice(0, shown);
  const basis = c.bases.lastSeen;

  return (
    <section aria-labelledby="reporting" className="mb-8 scroll-mt-16">
      <SectionHeading id="reporting" title="Which batteries are reporting" updated={{ at: basis.calculatedAt, prefix: 'Worked out' }}>
        Reporting means data arrived in the last {w} hours (example setting). Data received covers the last {c.settings.coveragePeriodDays} days.
      </SectionHeading>
      <div className="flex flex-wrap items-center gap-2 bg-cds-layer px-4 py-2">
        <label className="flex items-center gap-2">
          <span className="text-sm">Show</span>
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value as Filter);
              setShown(PAGE);
            }}
            className="h-10 border-b border-cds-border-strong bg-cds-layer-2 px-3 text-sm"
          >
            <option value="all">All batteries ({counts.all})</option>
            <option value="reporting">Reporting ({counts.reporting})</option>
            <option value="quiet">No data for {w} hours ({counts.quiet})</option>
            <option value="never">Never reported ({counts.never})</option>
          </select>
        </label>
        <p className="tnum text-xs leading-4 text-cds-text-secondary" role="status">
          {rows.length} {rows.length === 1 ? 'battery' : 'batteries'} shown
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="border border-t-0 border-cds-border-subtle px-4 py-6">No battery matches this filter.</p>
      ) : (
        <>
          <div tabIndex={0} role="region" aria-label="Batteries by reporting status, scrollable" className="hidden overflow-x-auto border-x border-cds-border-subtle md:block">
            <Table>
              <caption className="sr-only">Batteries by reporting status</caption>
              <TableHeader>
                <tr>
                  <TableHead>Battery</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">Last data <Working metricId="last_seen_at" basis={basis} name="Last data received" /></span>
                  </TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">Data received, per day <Working metricId="data_coverage_daily_pct" basis={c.bases.coverageDaily} name="Data received, daily" /></span>
                  </TableHead>
                  <TableHead numeric>
                    <span className="inline-flex items-center gap-1">Longest time with no data <Working metricId="data_gaps" basis={c.bases.gaps} name="Longest time with no data" /></span>
                  </TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {visible.map((b) => (
                  <TableRow key={b.batteryId}>
                    <TableCell><BatteryLink id={b.batteryId} serial={b.factorySerial} /></TableCell>
                    <TableCell><StatusTag status={b.status} hours={w} /></TableCell>
                    <TableCell className="whitespace-nowrap">
                      {b.lastSeenAt ? <time dateTime={b.lastSeenAt} title={dateTime(b.lastSeenAt)}>{ago(b.lastSeenAt)}</time> : <NotRecorded>Never reported</NotRecorded>}
                    </TableCell>
                    <TableCell><DayRow b={b} /></TableCell>
                    <TableCell numeric>{b.status === 'never' ? <NotRecorded>Never reported</NotRecorded> : gapText(b.longestGapHours, c.settings.gapLongerThanHours)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="space-y-px md:hidden" aria-label="Batteries by reporting status">
            {visible.map((b) => (
              <li key={b.batteryId} className="bg-cds-layer-2 p-4 outline outline-1 outline-cds-border-subtle">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <BatteryLink id={b.batteryId} serial={b.factorySerial} />
                  <StatusTag status={b.status} hours={w} />
                </div>
                <p className="mt-1 text-xs leading-4 text-cds-text-secondary">
                  Last data: {b.lastSeenAt ? ago(b.lastSeenAt) : 'Never reported'} · Longest time with no data:{' '}
                  {b.status === 'never' ? 'Never reported' : gapText(b.longestGapHours, c.settings.gapLongerThanHours)}
                </p>
                <div className="mt-2 overflow-x-auto">
                  <DayRow b={b} />
                </div>
              </li>
            ))}
          </ul>
          {rows.length > shown ? (
            <div className="border border-t-0 border-cds-border-subtle bg-cds-layer px-4 py-2">
              <Button size="sm" variant="tertiary" onClick={() => setShown((n) => n + PAGE)}>
                Show more ({rows.length - shown} left)
              </Button>
            </div>
          ) : null}
        </>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <SourceTag source="calculated" />
        <Updated at={basis.calculatedAt} prefix="Updated" />
      </div>
    </section>
  );
}
