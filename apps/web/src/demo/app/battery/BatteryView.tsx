import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, FileWarning, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { InlineNotification } from '../../../components/ui/inline-notification';
import { Skeleton } from '../../../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Tile, TileLabel } from '../../../components/ui/tile';
import { ApiError, apiFetch } from '../../../lib/api/client';
import { usePageTitle } from '../../../lib/usePageTitle';
import { BatteryDetailSchema, type BatteryDetail, type Figure } from '../../types-battery';
import { NotRecorded, SourceInfo, SourceTag, Updated, Working } from '../figure';
import { ago, date, dateTime, num, plural } from '../format';
import { useDemoCan } from '../session';
import { SEVERITY } from '../severity';
import { Tag } from '../../../components/ui/tag';
import { SohChart } from './SohChart';

function useBattery(id: string) {
  return useQuery({
    queryKey: ['demo', 'battery', id],
    queryFn: () => apiFetch(`/batteries/${encodeURIComponent(id)}`, { schema: BatteryDetailSchema }),
    retry: false,
  });
}

function SectionHeading({ id, title, children, right }: { id: string; title: string; children?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div>
        <h2 id={id} className="text-xl leading-7">
          {title}
        </h2>
        {children ? <p className="mt-0.5 text-cds-text-secondary">{children}</p> : null}
      </div>
      {right}
    </div>
  );
}

/** Source, freshness and working for one figure. */
function Footer({ f, name, at }: { f: Figure; name: string; at?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <SourceTag source={f.source} />
      {f.updatedAt ?? at ? (
        <Updated at={(f.updatedAt ?? at)!} />
      ) : (
        <span className="text-xs leading-4 text-cds-text-helper">Never reported</span>
      )}
      <Working metricId={f.basis.metricId} basis={f.basis} name={name} />
    </div>
  );
}

// ---------------------------------------------------------------- field tiles

function FieldTile({ label, f, value, sub }: { label: string; f: Figure; value: ReactNode; sub?: ReactNode }) {
  return (
    <Tile className="flex flex-col">
      <TileLabel className="pt-1">{label}</TileLabel>
      <p className="tnum mt-2 text-[28px] leading-9">{value}</p>
      <p className="mt-1 min-h-5 text-cds-text-secondary">{sub}</p>
      <div className="mt-auto pt-4">
        <Footer f={f} name={label} />
      </div>
    </Tile>
  );
}

function FieldTiles({ d }: { d: BatteryDetail }) {
  const f = d.field;
  const nr = <NotRecorded />;
  const never = <NotRecorded>Never reported</NotRecorded>;
  const fig = (id: string) => d.figures[id]!;
  return (
    <section aria-labelledby="field-h" className="mb-8">
      <SectionHeading id="field-h" title="Battery data">
        What this battery’s own system (BMS) reports, and what we work out from it.
      </SectionHeading>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FieldTile label="Health (reported by BMS)" f={fig('soh_reported_pct')} value={f.sohPct === null ? nr : `${num(f.sohPct, 1)}%`} sub="Sent by the BMS; we do not change it" />
        <FieldTile label="Cycles (reported by BMS)" f={fig('cycle_count_reported')} value={f.cycles === null ? nr : num(f.cycles)} sub="Sent by the BMS; we do not change it" />
        <FieldTile
          label={`Max temperature, last ${f.tempPeriodDays} days`}
          f={fig('max_temp_c')}
          value={f.maxTempC === null ? nr : `${num(f.maxTempC, 1)} °C`}
          sub="Highest reliable reading"
        />
        <FieldTile
          label="Last data received"
          f={fig('last_seen_at')}
          value={f.lastSeenAt === null ? never : ago(f.lastSeenAt)}
          sub={f.lastSeenAt === null ? 'This battery has never sent data' : dateTime(f.lastSeenAt)}
        />
        <FieldTile label="Charge level" f={fig('soc_pct')} value={f.socPct === null ? nr : `${num(f.socPct, 0)}%`} sub="Latest value from the BMS" />
        <FieldTile label={`Faults, last ${f.faultPeriodDays} days`} f={fig('fault_count')} value={f.faultCount30d === null ? nr : num(f.faultCount30d)} sub="Faults the BMS reported" />
        <FieldTile
          label="Difference between cells"
          f={fig('cell_voltage_spread_mv')}
          value={f.spreadMv === null ? nr : `${num(f.spreadMv)} mV`}
          sub={`Largest difference between cells, last ${d.coverage.periodDays} days`}
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- warnings

function Warnings({ d }: { d: BatteryDetail }) {
  return (
    <section aria-labelledby="warn-h" className="mb-8">
      <SectionHeading id="warn-h" title="Warnings explained">
        Which rule was broken, the value, and since when. Rules are example settings.
      </SectionHeading>
      {d.warnings.length === 0 ? (
        <InlineNotification kind="success" title="No open warnings">
          None of the example rules is broken for this battery right now.
        </InlineNotification>
      ) : (
        <ul className="space-y-px">
          {d.warnings.map((w) => {
            const s = SEVERITY[w.severity];
            const Icon = s.icon;
            return (
              <li key={w.ruleId} className="bg-cds-layer-2 p-4 outline outline-1 outline-cds-border-subtle">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Tag tone={s.tone}>
                    <Icon aria-hidden="true" />
                    {s.label}
                  </Tag>
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
                    {w.condition}
                  </span>
                </div>
                <p className="mt-2">{w.explanation}</p>
                {w.trend ? <p className="mt-1">{w.trend}</p> : null}
                <dl className="tnum mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs leading-4 text-cds-text-secondary">
                  <div className="flex gap-1">
                    <dt>Value:</dt>
                    <dd>{w.observed ?? <NotRecorded />}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>Since:</dt>
                    <dd>
                      <time dateTime={w.detectedAt} title={dateTime(w.detectedAt)}>
                        {dateTime(w.detectedAt)} ({ago(w.detectedAt)})
                      </time>
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- health history

function History({ d }: { d: BatteryDetail }) {
  const f = d.figures.soh_reported_history!;
  return (
    <section aria-labelledby="hist-h" className="mb-8">
      <SectionHeading id="hist-h" title="Health (reported by BMS) over time">
        Every health value the BMS sent. We do not work out health ourselves.
      </SectionHeading>
      <Tile>
        {d.sohHistory.length === 0 ? (
          <p className="py-8 text-center text-cds-text-secondary">
            This battery has not reported health yet, so there is nothing to chart.
          </p>
        ) : (
          <SohChart
            points={d.sohHistory}
            events={d.warnings.map((w) => ({ at: w.detectedAt, label: w.condition }))}
            limitPct={d.sohRuleLimitPct}
            limitLabel={`Warning below ${d.sohRuleLimitPct}% (example rule)`}
          />
        )}
        <div className="mt-4">
          <Footer f={f} name="Health (reported by BMS) history" />
        </div>
      </Tile>
    </section>
  );
}

// ---------------------------------------------------------------- cell voltage grid

function VoltageGrid({ d }: { d: BatteryDetail }) {
  const v = d.cellVoltages;
  const modules = v ? [...new Set(v.cells.map((c) => c.module))].sort((a, b) => a - b) : [];
  return (
    <section aria-labelledby="volt-h" className="mb-8">
      <SectionHeading id="volt-h" title="Latest cell voltages" right={v ? <Updated at={v.observedAt} prefix="Reading from" /> : null}>
        The newest voltages the BMS sent, per module. We do not mark odd cells yet because no limit is set.
      </SectionHeading>
      <Tile>
        {v ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {modules.map((mod) => (
                <div key={mod}>
                  <h3 className="mb-1 text-xs font-semibold leading-4 tracking-[0.32px] text-cds-text-secondary">Module {mod}</h3>
                  <ul className="grid grid-cols-2 gap-px bg-cds-border-subtle">
                    {v.cells
                      .filter((c) => c.module === mod)
                      .sort((a, b) => a.slot - b.slot)
                      .map((c) => (
                        <li key={c.slot} className="bg-cds-layer-2 px-3 py-2">
                          <span className="block text-xs leading-4 text-cds-text-secondary">Cell {c.slot}</span>
                          <span className="tnum">{num(c.mv)} mV</span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-cds-border-subtle pt-3">
              <span className="text-cds-text-secondary">Difference between cells (largest, last {d.coverage.periodDays} days)</span>
              <span className="tnum text-xl leading-7">{d.field.spreadMv === null ? <NotRecorded /> : `${num(d.field.spreadMv)} mV`}</span>
            </p>
          </>
        ) : (
          <p className="py-8 text-center text-cds-text-secondary">No cell voltage reading has arrived from this battery yet.</p>
        )}
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <SourceTag source="bms" />
            {v ? <Updated at={v.observedAt} prefix="Reading from" /> : <span className="text-xs leading-4 text-cds-text-helper">Never reported</span>}
            <SourceInfo name="Cell voltages" source="bms" from="Cell voltage readings from the BMS" at={v?.observedAt ?? null} />
            <SourceTag source="calculated" />
            <span className="text-xs leading-4 text-cds-text-secondary">difference</span>
            <Working metricId="cell_voltage_spread_mv" basis={d.figures.cell_voltage_spread_mv!.basis} name="Difference between cells" />
          </div>
        </div>
      </Tile>
    </section>
  );
}

// ---------------------------------------------------------------- passport

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs leading-4 text-cds-text-secondary">{label}</dt>
      <dd className="break-words">{children ?? <NotRecorded />}</dd>
    </div>
  );
}

function Passport({ d, canImport }: { d: BatteryDetail; canImport: boolean }) {
  const b = d.birth;
  const f = d.figures.build_date!;
  const or = (v: string | null | undefined) => (v ? v : <NotRecorded />);
  return (
    <section aria-labelledby="pass-h" className="min-w-0">
      <SectionHeading id="pass-h" title="Passport and factory record">
        Recorded at the factory.
      </SectionHeading>
      <Tile>
        {b ? (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Field label="Build date">{date(b.buildDate)}</Field>
            <Field label="Production line">{or(b.line)}</Field>
            <Field label="Shift">{or(b.shift)}</Field>
            <Field label="Model">{or(b.model)}</Field>
            <Field label="Chemistry">{or(b.chemistry)}</Field>
            <Field label="Rated capacity">{b.ratedCapacityAh !== null ? `${num(b.ratedCapacityAh, 1)} Ah` : <NotRecorded />}</Field>
            <Field label="Cell supplier">{or(b.cellSupplier)}</Field>
            <Field label="Cell batches">{b.cellLots.length ? b.cellLots.join(', ') : <NotRecorded />}</Field>
            <Field label="Cell grade range">{or(b.gradeSpread)}</Field>
            <Field label="Final factory test">
              {b.eolResult ? `${b.eolResult === 'pass' ? 'Pass' : 'Fail'}${b.eolDate ? `, ${date(b.eolDate)}` : ''}` : <NotRecorded />}
            </Field>
            <Field label="BMS software (current)">{or(b.firmware)}</Field>
            <Field label="BMS software at build">{or(b.firmwareAtBuild)}</Field>
          </dl>
        ) : (
          <InlineNotification kind="info" title="No factory record for this battery">
            <p>
              This battery has no factory record, so its build details show “Not recorded”.
              {canImport ? '' : ' An Admin can add them by importing factory data.'}
            </p>
            {canImport ? (
              <p className="mt-1">
                <Link to="/imports" className="inline-flex items-center gap-1 text-cds-interactive hover:underline">
                  <FileWarning aria-hidden="true" className="h-4 w-4" />
                  Go to factory data import
                </Link>
              </p>
            ) : null}
          </InlineNotification>
        )}
        <div className="mt-4 border-t border-cds-border-subtle pt-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <SourceTag source="registered" />
            <Updated at={d.updated.registry} prefix="Factory data imported" />
            <SourceInfo name="Factory record fields" source="registered" from="The factory record" at={b ? d.updated.registry : null} />
            <Working metricId={f.basis.metricId} basis={f.basis} name="Build date" />
          </div>
        </div>
      </Tile>
    </section>
  );
}

function Deployments({ d }: { d: BatteryDetail }) {
  return (
    <section aria-labelledby="dep-h" className="min-w-0">
      <SectionHeading id="dep-h" title="Deployment">
        Where this battery is and where it has been.
      </SectionHeading>
      <Tile>
        {d.deployments.length === 0 ? (
          <p className="py-4 text-cds-text-secondary">
            This battery has not been deployed. No holder or site is <NotRecorded>recorded</NotRecorded> yet.
          </p>
        ) : (
          <ol className="space-y-px">
            {d.deployments.map((e) => (
              <li key={`${e.from}${e.site}`} className="bg-cds-layer-2 p-3 outline outline-1 outline-cds-border-subtle">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{e.holder}</span>
                  {e.to === null ? <Tag tone="success">Current</Tag> : <Tag tone="outline">Past</Tag>}
                </div>
                <p className="text-cds-text-secondary">{e.site}</p>
                <p className="tnum text-xs leading-4 text-cds-text-secondary">
                  From {date(e.from)} {e.to ? `to ${date(e.to)}` : 'to now'}
                </p>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <SourceTag source="registered" />
          <Updated at={d.updated.registry} prefix="Factory data imported" />
          <SourceInfo name="Deployment history" source="registered" from="Deployment details entered by an Admin or imported with the factory data" at={d.deployments.length ? d.updated.registry : null} />
        </div>
      </Tile>
    </section>
  );
}

// ---------------------------------------------------------------- cells

const csvCell = (v: string | number | null) => {
  const s = v === null ? 'not recorded' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function downloadCells(d: BatteryDetail) {
  const head = ['cell_serial', 'module', 'slot', 'lot', 'ocv_v', 'ir_milliohm', 'capacity_ah', 'grade'];
  const rows = d.cells.map((c) => [c.cellSerial, c.module, c.slot, c.lotId, c.ocvV, c.irMilliohm, c.capacityAh, c.grade]);
  const csv = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${d.battery.factorySerial}-cells.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function Cells({ d }: { d: BatteryDetail }) {
  const v = (n: number | null, digits: number) => (n === null ? <NotRecorded /> : num(n, digits));
  return (
    <section aria-labelledby="cells-h" className="mb-8">
      <SectionHeading
        id="cells-h"
        title="Cells"
        right={
          d.cells.length ? (
            <Button size="sm" variant="tertiary" onClick={() => downloadCells(d)}>
              <Download aria-hidden="true" />
              Download CSV
            </Button>
          ) : null
        }
      >
        {d.cells.length ? `${plural(d.cells.length, 'cell')} as recorded at the factory.` : 'Every cell in this battery, as recorded at the factory.'}
      </SectionHeading>
      {d.cells.length === 0 ? (
        <Tile>
          <p className="py-6 text-cds-text-secondary">
            No cell records. Cells come from the factory record, and this battery has none.
          </p>
        </Tile>
      ) : (
        <>
          <div role="region" tabIndex={0} aria-label="Cell records, scrollable" className="hidden max-h-[480px] overflow-auto border border-cds-border-subtle md:block">
            <Table>
              <caption className="sr-only">Cell records for {d.battery.factorySerial}</caption>
              <TableHeader>
                <tr>
                  <TableHead>Cell serial</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Slot</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead numeric>Resting voltage (V)</TableHead>
                  <TableHead numeric>Internal resistance (mΩ)</TableHead>
                  <TableHead numeric>Capacity (Ah)</TableHead>
                  <TableHead>Grade</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {d.cells.map((c) => (
                  <TableRow key={c.cellSerial}>
                    <TableCell className="tnum">{c.cellSerial}</TableCell>
                    <TableCell className="tnum">{c.module}</TableCell>
                    <TableCell className="tnum">{c.slot}</TableCell>
                    <TableCell className="tnum">{c.lotId}</TableCell>
                    <TableCell numeric>{v(c.ocvV, 3)}</TableCell>
                    <TableCell numeric>{v(c.irMilliohm, 2)}</TableCell>
                    <TableCell numeric>{v(c.capacityAh, 2)}</TableCell>
                    <TableCell>{c.grade ?? <NotRecorded />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div role="region" tabIndex={0} aria-label="Cell records, scrollable" className="max-h-[560px] overflow-auto md:hidden">
            <ul className="space-y-px" aria-label="Cell records">
            {d.cells.map((c) => (
              <li key={c.cellSerial} className="bg-cds-layer-2 p-4 outline outline-1 outline-cds-border-subtle">
                <p className="tnum font-semibold">{c.cellSerial}</p>
                <p className="text-xs leading-4 text-cds-text-secondary">
                  Module {c.module}, slot {c.slot} · Batch {c.lotId}
                </p>
                <dl className="tnum mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                  <div><dt className="text-xs leading-4 text-cds-text-secondary">Resting voltage (V)</dt><dd>{v(c.ocvV, 3)}</dd></div>
                  <div><dt className="text-xs leading-4 text-cds-text-secondary">Internal resistance (mΩ)</dt><dd>{v(c.irMilliohm, 2)}</dd></div>
                  <div><dt className="text-xs leading-4 text-cds-text-secondary">Capacity (Ah)</dt><dd>{v(c.capacityAh, 2)}</dd></div>
                  <div><dt className="text-xs leading-4 text-cds-text-secondary">Grade</dt><dd>{c.grade ?? <NotRecorded />}</dd></div>
                </dl>
              </li>
            ))}
            </ul>
          </div>
        </>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <SourceTag source="registered" />
        <Updated at={d.updated.registry} prefix="Factory data imported" />
        <SourceInfo name="Cell records" source="registered" from="The factory record, cell test data" at={d.cells.length ? d.updated.registry : null} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- coverage and IDs

const ID_LABEL = { factory_serial: 'Factory serial', bms_id: 'Battery ID', qr: 'QR code' } as const;
const ID_SOURCE = { birth_record: 'Factory record', admin_entry: 'Entered by an Admin', bms: 'BMS' } as const;

function Coverage({ d }: { d: BatteryDetail }) {
  const c = d.coverage;
  const cov = d.figures.data_coverage_pct!;
  const daily = d.figures.data_coverage_daily_pct!;
  const gaps = d.figures.data_gaps!;
  const ids = d.identifiers;
  const never = d.field.lastSeenAt === null;
  const hasQr = ids.some((i) => i.idType === 'qr');
  return (
    <section aria-labelledby="cov-h" className="mb-8">
      <SectionHeading id="cov-h" title="Data received and ID check">
        How much of the expected data arrived, when it stopped, and which IDs belong to this battery.
      </SectionHeading>
      <div className="grid gap-4 lg:grid-cols-2">
        <Tile>
          <h3 className="font-semibold">Data received, last {c.periodDays} days</h3>
          <p className="tnum mt-2 text-[28px] leading-9">{never ? <NotRecorded>Never reported</NotRecorded> : c.pct === null ? <NotRecorded /> : `${num(c.pct, 1)}%`}</p>
          <p className="tnum text-cds-text-secondary">
            {num(c.received)} of {num(c.expected)} expected messages · longest time with no data {never ? 'Never reported' : `${num(c.longestGapHours, 1)} h`}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <SourceTag source={cov.source} />
            <Updated at={cov.basis.calculatedAt} />
            <Working metricId="data_coverage_pct" basis={cov.basis} name="Data received" />
          </div>
          <h4 className="mt-5 text-xs font-semibold leading-4 tracking-[0.32px] text-cds-text-secondary">By day</h4>
          {c.daily.length ? (
            <Table>
              <caption className="sr-only">Messages received each day, last {c.periodDays} days</caption>
              <TableHeader>
                <tr>
                  <TableHead>Day</TableHead>
                  <TableHead numeric className="whitespace-normal">Received</TableHead>
                  <TableHead numeric className="whitespace-normal">Expected</TableHead>
                  <TableHead numeric className="whitespace-normal">Data received</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {c.daily.map((r) => (
                  <TableRow key={r.day}>
                    <TableCell className="tnum">{date(r.day)}</TableCell>
                    <TableCell numeric>{num(r.received)}</TableCell>
                    <TableCell numeric>{num(r.expected)}</TableCell>
                    <TableCell numeric>{r.expected ? `${num((r.received / r.expected) * 100, 1)}%` : <NotRecorded>No data expected</NotRecorded>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="mt-1 text-cds-text-secondary">No days to show. This battery has not been deployed.</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <SourceTag source={daily.source} />
            <Updated at={daily.basis.calculatedAt} />
            <Working metricId="data_coverage_daily_pct" basis={daily.basis} name="Data received, daily" />
          </div>

          <h4 className="mt-5 text-xs font-semibold leading-4 tracking-[0.32px] text-cds-text-secondary">
            Time with no data over {c.gapLimitHours} hours
          </h4>
          {c.gaps.length ? (
            <ul className="mt-1 space-y-px">
              {c.gaps.map((g) => (
                <li key={g.from} className="tnum bg-cds-layer-2 px-3 py-2 outline outline-1 outline-cds-border-subtle">
                  <span className="font-semibold">{num(g.hours, 1)} h</span>{' '}
                  <span className="text-cds-text-secondary">
                    from {dateTime(g.from)} to {dateTime(g.to)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-cds-text-secondary">No time with no data over {c.gapLimitHours} hours in this period.</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <SourceTag source={gaps.source} />
            <Updated at={gaps.basis.calculatedAt} />
            <Working metricId="data_gaps" basis={gaps.basis} name="Time with no data" />
          </div>
        </Tile>

        <Tile>
          <h3 className="font-semibold">IDs linked to this battery</h3>
          <p className="mt-1 text-xs leading-4 text-cds-text-secondary">
            BMS data is matched to this battery by any of these IDs.
          </p>
          <ul className="mt-3 space-y-px">
            {ids.map((i) => (
              <li key={`${i.idType}${i.value}`} className="bg-cds-layer-2 p-3 outline outline-1 outline-cds-border-subtle">
                <p className="text-xs leading-4 text-cds-text-secondary">{ID_LABEL[i.idType]}</p>
                <p className="tnum break-all font-semibold">{i.value}</p>
                <p className="text-xs leading-4 text-cds-text-secondary">
                  {i.source === 'bms' && i.linkedBy ? `Linked by ${i.linkedBy}` : ID_SOURCE[i.source]} ·{' '}
                  <time dateTime={i.linkedAt} title={dateTime(i.linkedAt)}>
                    {date(i.linkedAt)}
                  </time>
                  {i.messagesReplayed ? ` · ${plural(i.messagesReplayed, 'waiting message')} now linked` : ''}
                </p>
              </li>
            ))}
            {hasQr ? null : (
              <li className="bg-cds-layer-2 p-3 outline outline-1 outline-cds-border-subtle">
                <p className="text-xs leading-4 text-cds-text-secondary">QR code</p>
                <p><NotRecorded /></p>
              </li>
            )}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <SourceTag source="registered" />
            <Updated at={d.updated.registry} prefix="Factory data imported" />
          </div>
        </Tile>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- page

function Header({ d }: { d: BatteryDetail }) {
  const b = d.battery;
  return (
    <div className="mb-6">
      <h1 className="text-[28px] leading-9">{b.factorySerial}</h1>
      <p className="tnum mt-1 text-cds-text-secondary">
        Battery ID {b.bmsId} · {b.model ?? 'Model not recorded'}
        {b.holder ? ` · ${b.holder}, ${b.site ?? 'site not recorded'}` : ' · Not deployed'}
      </p>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Active warnings">
        {d.warnings.length === 0 ? (
          <li>
            <Tag tone="success">No open warnings</Tag>
          </li>
        ) : (
          d.warnings.map((w) => {
            const s = SEVERITY[w.severity];
            const Icon = s.icon;
            return (
              <li key={w.ruleId}>
                <Tag tone={s.tone} className="h-auto min-h-6 whitespace-normal py-0.5">
                  <Icon aria-hidden="true" />
                  Warning ({s.label}): {w.condition}
                </Tag>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

function LoadingView() {
  return (
    <div aria-busy="true" aria-label="Loading battery">
      <Skeleton className="mb-2 h-9 w-72" />
      <Skeleton className="mb-6 h-5 w-96 max-w-full" />
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
      <Skeleton className="mb-8 h-72" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

export function BatteryView() {
  const { batteryId = '' } = useParams();
  const q = useBattery(batteryId);
  const canImport = useDemoCan('imports.run');
  const d = q.data;
  usePageTitle(d ? d.battery.factorySerial : 'Battery');
  const missing = q.error instanceof ApiError && q.error.status === 404;

  return (
    <div className="mx-auto max-w-[1312px] px-4 pb-16 pt-6 lg:px-8">
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-cds-interactive hover:underline">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Fleet overview
      </Link>
      {q.isPending ? (
        <LoadingView />
      ) : q.isError || !d ? (
        <InlineNotification
          kind={missing ? 'warning' : 'error'}
          title={missing ? 'We could not find that battery' : 'This battery could not be loaded'}
          action={
            missing ? undefined : (
              <Button size="sm" variant="tertiary" onClick={() => void q.refetch()}>
                Try again
              </Button>
            )
          }
        >
          {missing
            ? 'It may have been removed, or it is not one of your manufacturer’s batteries. Go back to the fleet overview and pick one from the list.'
            : 'Nothing was changed. Try again; if it keeps failing, reload the page.'}
        </InlineNotification>
      ) : (
        <>
          <Header d={d} />
          {d.birth ? null : (
            <InlineNotification kind="info" title="No factory record for this battery" className="mb-8">
              Build details and cell records show “Not recorded”. Battery data still arrives and is shown below.
              {canImport ? (
                <>
                  {' '}
                  <Link to="/imports" className="text-cds-interactive hover:underline">
                    Import factory data
                  </Link>
                </>
              ) : null}
            </InlineNotification>
          )}
          <Warnings d={d} />
          <FieldTiles d={d} />
          <History d={d} />
          <VoltageGrid d={d} />
          <div className="mb-8 grid gap-8 xl:grid-cols-2">
            <Passport d={d} canImport={canImport} />
            <Deployments d={d} />
          </div>
          <Cells d={d} />
          <Coverage d={d} />
          <p className="text-xs leading-4 text-cds-text-helper">Page data as of {dateTime(d.asOf)}</p>
        </>
      )}
    </div>
  );
}
