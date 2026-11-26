import { ArrowRight, FileWarning, RadioTower, SlidersHorizontal, Unlink, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { m } from 'motion/react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { InlineNotification } from '../../../components/ui/inline-notification';
import { Skeleton } from '../../../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Tile, TileLabel } from '../../../components/ui/tile';
import { usePageTitle } from '../../../lib/usePageTitle';
import type { BatteryRef, Distribution, FleetOverview, Severity } from '../../types';
import { NotRecorded, SourceTag, Updated, Working } from '../figure';
import { ago, dateTime, num, plural } from '../format';
import { fadeUp, lift, staggerParent } from '../motion';
import { SEVERITY, SeverityTag } from '../severity';
import { useOverview } from '../Shell';
import { BatteryTable } from './BatteryTable';
import { Histogram } from './Histogram';
import { Tabs } from './Tabs';

const batteryName = (b: BatteryRef) => b.factorySerial ?? b.bmsId ?? 'Unnamed battery';

function BatteryLink({ b }: { b: BatteryRef }) {
  return (
    <Link to={`/batteries/${b.batteryId}`} className="font-semibold text-cds-interactive hover:underline">
      {batteryName(b)}
    </Link>
  );
}

function SectionHeading({
  id,
  title,
  updated,
  children,
}: {
  id: string;
  title: string;
  updated?: { at: string; prefix?: string };
  children?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div>
        <h2 id={id} className="text-lg leading-7 font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        {children ? <p className="mt-0.5 text-cds-text-secondary">{children}</p> : null}
      </div>
      {updated ? <Updated at={updated.at} prefix={updated.prefix} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- needs attention

function Attention({ o }: { o: FleetOverview }) {
  const notReporting = o.registered.value - o.reporting.value;
  const w = o.warnings.bySeverity;
  const openTotal = w.high + w.medium + w.low;
  const worst: Severity | null = w.high ? 'high' : w.medium ? 'medium' : w.low ? 'low' : null;
  const items: { key: string; icon: ReactNode; count: number; text: string; detail: string; href: string }[] = [];
  if (openTotal && worst) {
    const Icon = SEVERITY[worst].icon;
    items.push({
      key: 'warnings',
      icon: <Icon aria-hidden="true" className={worst === 'high' ? 'text-cds-error' : 'text-[#8e6a00]'} />,
      count: openTotal,
      text: openTotal === 1 ? 'open warning' : 'open warnings',
      detail: (['high', 'medium', 'low'] as const).filter((s) => w[s]).map((s) => `${w[s]} ${SEVERITY[s].label}`).join(' · '),
      href: '?tab=warnings#warnings',
    });
  }
  if (notReporting)
    items.push({
      key: 'reporting',
      icon: <WifiOff aria-hidden="true" className="text-cds-text-primary" />,
      count: notReporting,
      text: notReporting === 1 ? 'battery not reporting' : 'batteries not reporting',
      detail: `No data in the last ${o.settings.reportingWindowHours} hours`,
      href: '?tab=data#coverage',
    });
  if (o.gaps.value)
    items.push({
      key: 'gaps',
      icon: <RadioTower aria-hidden="true" className="text-cds-text-primary" />,
      count: o.gaps.value,
      text: o.gaps.value === 1 ? 'battery missing data' : 'batteries missing data',
      detail: `Last ${o.settings.coveragePeriodDays} days`,
      href: '?tab=data#coverage',
    });
  if (o.unmatched.value)
    items.push({
      key: 'unmatched',
      icon: <Unlink aria-hidden="true" className="text-cds-text-primary" />,
      count: o.unmatched.value,
      text: o.unmatched.value === 1 ? 'battery ID is not recognised' : 'battery IDs are not recognised',
      detail: 'Data kept until linked',
      href: '?tab=data#data-quality',
    });
  if (o.noBirthRecord.value)
    items.push({
      key: 'birth',
      icon: <FileWarning aria-hidden="true" className="text-cds-text-primary" />,
      count: o.noBirthRecord.value,
      text: o.noBirthRecord.value === 1 ? 'battery without factory record' : 'batteries without factory record',
      detail: 'Entered by an Admin',
      href: '?tab=data#data-quality',
    });

  return (
    <section aria-labelledby="attention-h" className="mb-8">
      <h2 id="attention-h" className="mb-3 text-lg leading-7 font-semibold tracking-[-0.01em]">
        Needs attention
      </h2>
      {items.length === 0 ? (
        <InlineNotification kind="success" title="Nothing needs attention">
          No open warnings, every battery reported in the last {o.settings.reportingWindowHours} hours, and
          every ID is matched.
        </InlineNotification>
      ) : (
        <m.ul className="flex flex-wrap gap-3" variants={staggerParent} initial="hidden" animate="show">
          {items.map((i) => (
            <m.li
              key={i.key}
              variants={fadeUp}
              whileHover={lift}
              className="grad-tile min-w-0 flex-1 basis-full rounded-lg sm:basis-[260px] xl:basis-[200px]"
            >
              <a
                href={i.href}
                className="group flex h-full items-start gap-3 rounded-lg p-4 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:shrink-0"
              >
                <span className="mt-1">{i.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2 xl:block">
                    <span className="tnum text-3xl font-semibold tracking-[-0.02em] xl:block">{num(i.count)}</span>
                    <span className="font-semibold xl:block">{i.text}</span>
                  </span>
                  <span className="block text-xs leading-4 text-cds-text-secondary">{i.detail}</span>
                </span>
                <ArrowRight aria-hidden="true" className="mt-2 !h-4 !w-4 text-cds-interactive opacity-0 group-hover:opacity-100" />
              </a>
            </m.li>
          ))}
        </m.ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- key figures

const MTile = m.create(Tile);

function KeyFigure({
  label,
  metricId,
  basis,
  value,
  sub,
}: {
  label: string;
  metricId: string;
  basis: FleetOverview['registered']['basis'];
  value: ReactNode;
  sub: ReactNode;
}) {
  return (
    <MTile variants={fadeUp} className="grad-tile flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <TileLabel className="pt-1">{label}</TileLabel>
        <Working metricId={metricId} basis={basis} name={label} className="-mr-1 -mt-0.5" />
      </div>
      <p className="tnum mt-2 text-3xl font-semibold tracking-[-0.02em]">{value}</p>
      <p className="mt-1 text-cds-text-secondary">{sub}</p>
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4">
        <SourceTag source="calculated" />
        <Updated at={basis.calculatedAt} prefix="Updated" />
      </div>
    </MTile>
  );
}

function KeyFigures({ o }: { o: FleetOverview }) {
  const h = o.health;
  return (
    <section aria-labelledby="glance-h" className="mb-8">
      <h2 id="glance-h" className="mb-3 text-lg leading-7 font-semibold tracking-[-0.01em]">
        At a glance
      </h2>
      <m.div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" variants={staggerParent} initial="hidden" animate="show">
        <KeyFigure
          label="Batteries on record"
          metricId="batteries_registered"
          basis={o.registered.basis}
          value={num(o.registered.value)}
          sub={`${num(o.registered.value - o.noBirthRecord.value)} from factory records · ${num(o.noBirthRecord.value)} entered by Admin`}
        />
        <KeyFigure
          label="Reporting now"
          metricId="batteries_reporting"
          basis={o.reporting.basis}
          value={
            <>
              {num(o.reporting.value)}
              <span className="text-xl text-cds-text-secondary"> of {num(o.registered.value)}</span>
            </>
          }
          sub={`Sent data in the last ${o.settings.reportingWindowHours} hours (example setting)`}
        />
        <KeyFigure
          label="Battery health, mean (reported by BMS)"
          metricId="fleet_soh_reported_mean"
          basis={{ ...h.basis, metricId: 'fleet_soh_reported_mean' }}
          value={h.mean === null ? <NotRecorded /> : `${num(h.mean, 1)}%`}
          sub={
            h.min === null ? (
              'No battery has reported health yet'
            ) : (
              <span className="tnum">
                Spread {num(h.min, 1)}–{num(h.max!, 1)}% · median {num(h.median!, 1)}%
              </span>
            )
          }
        />
        <KeyFigure
          label="Data received, all batteries"
          metricId="fleet_data_coverage_pct"
          basis={o.coverage.basis}
          value={o.coverage.pct === null ? <NotRecorded /> : `${num(o.coverage.pct, 1)}%`}
          sub={`Of expected messages, last ${o.settings.coveragePeriodDays} days`}
        />
      </m.div>
    </section>
  );
}

// ---------------------------------------------------------------- warnings

function Warnings({ o }: { o: FleetOverview }) {
  const rulesFor = (s: Severity) => o.settings.rules.filter((r) => r.severity === s);
  return (
    <section aria-labelledby="warnings" className="mb-8 scroll-mt-16">
      <SectionHeading id="warnings" title="Open warnings" updated={{ at: o.warnings.basis.calculatedAt, prefix: 'Rules run' }}>
        From this manufacturer’s rules (example settings), worst first.
      </SectionHeading>
      <div className="grid gap-px border border-cds-border-subtle bg-cds-border-subtle sm:grid-cols-3">
        {(['high', 'medium', 'low'] as const).map((s) => (
          <div key={s} className="bg-cds-layer p-4">
            <div className="flex items-center justify-between gap-2">
              <SeverityTag severity={s} />
              {s === 'high' ? <Working metricId="open_warnings_by_severity" basis={o.warnings.basis} name="Open warnings by severity" /> : null}
            </div>
            <p className="tnum mt-2 text-3xl font-semibold tracking-[-0.02em]">
              {num(o.warnings.bySeverity[s])}{' '}
              <span className="text-sm text-cds-text-secondary">open</span>
            </p>
            <ul className="mt-1 space-y-0.5 text-xs leading-4 text-cds-text-secondary">
              {rulesFor(s).map((r) => (
                <li key={r.ruleId} className="flex items-center gap-1">
                  <SlidersHorizontal aria-hidden="true" className="h-3 w-3 shrink-0" />
                  {r.condition}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {o.warnings.open.length ? (
        <>
          <div className="hidden overflow-x-auto border-x border-b border-cds-border-subtle md:block">
            <Table>
              <caption className="sr-only">Open warnings, worst first</caption>
              <TableHeader>
                <tr>
                  <TableHead>Severity</TableHead>
                  <TableHead>Battery</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead numeric>Value</TableHead>
                  <TableHead>Detected</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {o.warnings.open.map((w) => (
                  <TableRow key={w.warningId}>
                    <TableCell><SeverityTag severity={w.severity} /></TableCell>
                    <TableCell><BatteryLink b={w.battery} /></TableCell>
                    <TableCell>{w.condition}</TableCell>
                    <TableCell numeric>{w.observed ?? <NotRecorded />}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <time dateTime={w.detectedAt} title={dateTime(w.detectedAt)}>{ago(w.detectedAt)}</time>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="space-y-px md:hidden" aria-label="Open warnings, worst first">
            {o.warnings.open.map((w) => (
              <li key={w.warningId} className="bg-cds-layer-2 p-4 outline outline-1 outline-cds-border-subtle">
                <div className="flex items-center justify-between gap-2">
                  <BatteryLink b={w.battery} />
                  <SeverityTag severity={w.severity} />
                </div>
                <p className="mt-1">{w.condition}</p>
                <p className="tnum mt-0.5 text-xs leading-4 text-cds-text-secondary">
                  {w.observed} · {ago(w.detectedAt)}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="border border-t-0 border-cds-border-subtle px-4 py-6">No warnings are open. New ones appear here when a rule is broken.</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- health and cycles

function DistributionTile({
  title,
  metricId,
  dist,
  unit,
  xTitle,
  decimals,
  reference,
}: {
  title: string;
  metricId: string;
  dist: Distribution;
  unit: string;
  xTitle: string;
  decimals: number;
  reference?: { value: number; label: string };
}) {
  const stat = (v: number | null) => (v === null ? <NotRecorded /> : `${num(v, decimals)}${unit}`);
  return (
    <Tile>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        <Working metricId={metricId} basis={dist.basis} name={title} className="-mr-1" />
      </div>
      <dl className="tnum mt-2 grid grid-cols-3 gap-2 border-b border-cds-border-subtle pb-3">
        {(
          [
            ['Lowest', dist.min],
            ['Median', dist.median],
            ['Highest', dist.max],
          ] as const
        ).map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs leading-4 text-cds-text-secondary">{k}</dt>
            <dd className="text-xl leading-7">{stat(v)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3">
        {dist.n ? (
          <Histogram
            dist={dist}
            unit={unit}
            xTitle={xTitle}
            formatBand={(a, b) => `${num(a)}–${num(b)}`}
            reference={reference}
            tableCaption={`${title}: batteries per band`}
          />
        ) : (
          <p className="py-8 text-center text-cds-text-secondary">No battery has reported this yet.</p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <SourceTag source="calculated" />
        <span className="text-xs leading-4 text-cds-text-secondary">
          from {plural(dist.n, 'BMS-reported value')}
          {dist.excluded ? ` · ${num(dist.excluded)} not recorded` : ''}
        </span>
        <Updated at={dist.basis.calculatedAt} prefix="Updated" />
      </div>
    </Tile>
  );
}

function HealthAndCycles({ o }: { o: FleetOverview }) {
  const soh = o.settings.rules.find((r) => r.ruleId === 'soh_low');
  return (
    <section aria-labelledby="health" className="mb-8 scroll-mt-16">
      <SectionHeading id="health" title="Health and cycles across all batteries">
        What each battery’s own system (BMS) reports. We do not work out health or cycles ourselves.
      </SectionHeading>
      <div className="grid gap-4 lg:grid-cols-2">
        <DistributionTile
          title="Health (reported by BMS)"
          metricId="fleet_soh_reported_distribution"
          dist={o.health}
          unit="%"
          xTitle="Health (reported by BMS) (%)"
          decimals={1}
          reference={soh ? { value: 80, label: 'Warning below 80% (example rule)' } : undefined}
        />
        <DistributionTile
          title="Cycles (reported by BMS)"
          metricId="fleet_cycle_count_distribution"
          dist={o.cycles}
          unit=""
          xTitle="Cycles (reported by BMS)"
          decimals={0}
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- coverage and data quality

function Coverage({ o }: { o: FleetOverview }) {
  const notReporting = o.registered.value - o.reporting.value;
  return (
    <section aria-labelledby="coverage" className="min-w-0 scroll-mt-16">
      <SectionHeading id="coverage" title="Data received" updated={{ at: o.updated.bms, prefix: 'Battery data received' }} />
      <Tile>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold">Batteries missing data</h3>
          <Working metricId="batteries_with_gaps" basis={o.gaps.basis} name="Batteries missing data" className="-mr-1" />
        </div>
        <p className="mt-1 text-xs leading-4 text-cds-text-secondary">
          Data received below {o.settings.gapCoverageBelowPct}% or no data for more than {o.settings.gapLongerThanHours} hours,
          last {o.settings.coveragePeriodDays} days (example settings)
        </p>
        {o.gaps.batteries.length ? (
          <div tabIndex={0} role="region" aria-label="Batteries missing data, scrollable" className="mt-3 overflow-x-auto">
          <Table>
            <caption className="sr-only">Batteries missing data</caption>
            <TableHeader className="static">
              <tr>
                <TableHead>Battery</TableHead>
                <TableHead numeric className="whitespace-normal">Data received (%)</TableHead>
                <TableHead numeric className="whitespace-normal">Longest time with no data (hours)</TableHead>
                <TableHead className="hidden sm:table-cell">Last data</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {o.gaps.batteries.map((g) => (
                <TableRow key={g.battery.batteryId}>
                  <TableCell><BatteryLink b={g.battery} /></TableCell>
                  <TableCell numeric>{num(g.coveragePct, 1)}</TableCell>
                  <TableCell numeric>{num(g.longestGapHours)}</TableCell>
                  <TableCell className="hidden whitespace-nowrap sm:table-cell">
                    {g.lastSeenAt ? <time dateTime={g.lastSeenAt} title={dateTime(g.lastSeenAt)}>{ago(g.lastSeenAt)}</time> : <NotRecorded>Never reported</NotRecorded>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        ) : (
          <p className="mt-3">Every deployed battery sent its expected data.</p>
        )}
        {notReporting > o.gaps.value ? (
          <p className="mt-3 text-xs leading-4 text-cds-text-secondary">
            Not in this list: {plural(notReporting - o.gaps.value, 'battery', 'batteries')} with no deployment recorded, so no data is expected yet.
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <SourceTag source="calculated" />
          <Updated at={o.gaps.basis.calculatedAt} prefix="Updated" />
        </div>
      </Tile>
    </section>
  );
}

function DataQuality({ o }: { o: FleetOverview }) {
  return (
    <section aria-labelledby="data-quality" className="min-w-0 scroll-mt-16">
      <SectionHeading id="data-quality" title="Data quality" updated={{ at: o.updated.registry, prefix: 'Factory data imported' }} />
      <div className="space-y-4">
        <Tile>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold">Unrecognised battery IDs</h3>
            <Working metricId="unmatched_id_count" basis={o.unmatched.basis} name="Unrecognised battery IDs" className="-mr-1" />
          </div>
          <p className="mt-1 text-xs leading-4 text-cds-text-secondary">
            We keep their data. An Admin can link each ID, or a factory record can arrive.
          </p>
          {o.unmatched.ids.length ? (
            <Table className="mt-3">
              <caption className="sr-only">Unrecognised battery IDs</caption>
              <TableHeader className="static">
                <tr>
                  <TableHead>Battery ID</TableHead>
                  <TableHead numeric>Messages waiting</TableHead>
                  <TableHead>First seen</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {o.unmatched.ids.map((u) => (
                  <TableRow key={u.unmatchedId}>
                    <TableCell className="font-semibold">{u.idValue}</TableCell>
                    <TableCell numeric>{num(u.messagesHeld)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <time dateTime={u.firstSeenAt} title={dateTime(u.firstSeenAt)}>{ago(u.firstSeenAt)}</time>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="mt-3">Every battery ID that sent data is recognised.</p>
          )}
        </Tile>
        <Tile>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold">Batteries without a factory record</h3>
            <Working metricId="batteries_no_birth_record" basis={o.noBirthRecord.basis} name="Batteries without birth record" className="-mr-1" />
          </div>
          <p className="mt-1 text-xs leading-4 text-cds-text-secondary">
            Entered by an Admin. Build date, model and rated capacity are not recorded until the factory data arrives.
          </p>
          {o.noBirthRecord.batteries.length ? (
            <ul className="mt-3 divide-y divide-cds-border-subtle border-y border-cds-border-subtle">
              {o.noBirthRecord.batteries.map((b) => (
                <li key={b.batteryId} className="flex items-center justify-between gap-2 bg-cds-layer-2 px-4 py-2">
                  <BatteryLink b={b} />
                  <span className="text-xs text-cds-text-helper">{b.bmsId}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3">Every battery has a birth record.</p>
          )}
        </Tile>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- settings and page

function ExampleSettings({ o }: { o: FleetOverview }) {
  const s = o.settings;
  return (
    <details className="group mt-8 border border-cds-border-subtle bg-cds-layer">
      <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 font-semibold hover:bg-cds-layer-hover">
        <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
        Settings used on this page (examples for a fictional manufacturer)
      </summary>
      <div className="border-t border-cds-border-subtle px-4 py-3">
        <p className="max-w-prose text-cds-text-secondary">
          Each manufacturer sets these for themselves. The values here are round, illustrative numbers chosen
          for the demo. They are not product defaults or engineering recommendations.
        </p>
        <dl className="tnum mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {[
            ['Reporting window', `${s.reportingWindowHours} hours`],
            ['Expected messages from BMS', `One message every ${s.sendIntervalMinutes} minutes`],
            ['Period for data received', `${s.coveragePeriodDays} days`],
            ['Missing data', `Data received below ${s.gapCoverageBelowPct}% or no data for more than ${s.gapLongerThanHours} hours`],
            ['Health chart bands', `${s.healthBandPct} percentage points`],
            ['Cycles chart bands', `${s.cycleBand} cycles`],
            ...s.rules.map((r) => [`Warning rule ${r.ruleId}`, `${r.condition} → ${r.severity[0]!.toUpperCase()}${r.severity.slice(1)}`]),
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <dt className="text-xs leading-4 text-cds-text-secondary">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}

function LoadingView() {
  return (
    <div aria-busy="true" aria-label="Loading the battery overview">
      <span className="sr-only" role="status">Loading the battery overview</span>
      <Skeleton className="mb-3 h-6 w-48" />
      <Skeleton className="mb-8 h-24 w-full" />
      <Skeleton className="mb-3 h-6 w-40" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
      <Skeleton className="mt-8 h-64 w-full" />
    </div>
  );
}

const TAB_IDS = ['summary', 'warnings', 'health', 'data', 'batteries'];

export function FleetView() {
  usePageTitle('Battery overview');
  const q = useOverview();
  const o = q.data;
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') ?? '';
  const tab = TAB_IDS.includes(raw) ? raw : 'summary';

  return (
    <div className="mx-auto max-w-[1312px] px-4 pb-16 pt-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-2xl leading-8 font-semibold tracking-[-0.01em]">Battery overview</h1>
          <p className="mt-1 text-cds-text-secondary">
            {o ? `${o.manufacturer.name} · ${plural(o.registered.value, 'battery', 'batteries')} registered` : ' '}
          </p>
        </div>
        {o ? (
          <div className="flex flex-col items-start gap-0.5 sm:items-end">
            <Updated at={o.updated.bms} prefix="BMS data received" />
            <Updated at={o.updated.calculations} prefix="Figures updated" />
            <Updated at={o.updated.registry} prefix="Factory data imported" />
          </div>
        ) : null}
      </div>

      {q.isPending ? (
        <LoadingView />
      ) : q.isError || !o ? (
        <InlineNotification
          kind="error"
          title="The battery overview could not be loaded"
          action={<Button size="sm" variant="tertiary" onClick={() => void q.refetch()}>Try again</Button>}
        >
          Nothing was changed. Try again; if it keeps failing, reload the page.
        </InlineNotification>
      ) : (
        <>
          <Tabs
            label="Battery overview sections"
            selected={tab}
            onSelect={(id) => setParams({ tab: id })}
            tabs={[
              { id: 'summary', label: 'Summary', panel: (<><Attention o={o} /><KeyFigures o={o} /></>) },
              { id: 'warnings', label: 'Warnings', count: o.warnings.bySeverity.high + o.warnings.bySeverity.medium + o.warnings.bySeverity.low, panel: <Warnings o={o} /> },
              { id: 'health', label: 'Health', panel: <HealthAndCycles o={o} /> },
              {
                id: 'data',
                label: 'Data',
                count: o.gaps.value,
                panel: (
                  <div className="mb-8 grid gap-8 xl:grid-cols-2">
                    <Coverage o={o} />
                    <DataQuality o={o} />
                  </div>
                ),
              },
              {
                id: 'batteries',
                label: 'All batteries',
                panel: (
                  <section aria-labelledby="batteries" className="scroll-mt-16">
                    <SectionHeading id="batteries" title="All batteries" updated={{ at: o.updated.calculations, prefix: 'Updated' }}>
                      Sorted by open warnings. Select a battery to see its details and live data.
                    </SectionHeading>
                    <BatteryTable settings={o.settings} />
                  </section>
                ),
              },
            ]}
          />
          <ExampleSettings o={o} />
          <p className="mt-4 text-xs leading-4 text-cds-text-helper">Page data as of {dateTime(o.asOf)}</p>
        </>
      )}
    </div>
  );
}
