// The chart is a keyboard-readable group: arrow keys step through its values.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { cn } from '../../../lib/cn';
import { dateTime, num } from '../format';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const DAY = 86_400_000;
const RANGES = [
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: '90', label: 'Last 90 days', days: 90 },
  { key: 'all', label: 'All', days: null },
] as const;

const shortDate = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export interface ChartPoint {
  observedAt: string;
  sohPct: number;
}
export interface ChartEvent {
  at: string;
  label: string;
}

/**
 * Health (reported by BMS) over time for one battery: a 2px line in the single accent, hairline grid,
 * labelled axes with units, a hover or arrow-key readout, warning events marked on the time axis and
 * the example rule line. The same numbers are always available as a table.
 */
export function SohChart({
  points,
  events,
  limitPct,
  limitLabel,
}: {
  points: ChartPoint[];
  events: ChartEvent[];
  limitPct: number;
  limitLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('90');
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  const shown = useMemo(() => {
    const def = RANGES.find((r) => r.key === range)!;
    const last = points.length ? Date.parse(points[points.length - 1]!.observedAt) : 0;
    return def.days === null ? points : points.filter((p) => Date.parse(p.observedAt) >= last - def.days * DAY);
  }, [points, range]);

  const H = 220;
  const m = { top: 24, right: 16, bottom: 56, left: 48 };
  const plotW = Math.max(0, width - m.left - m.right);
  const plotH = H - m.top - m.bottom;
  const times = shown.map((p) => Date.parse(p.observedAt));
  const t0 = times[0] ?? 0;
  const inRange = events.map((e) => ({ ...e, t: Date.parse(e.at) })).filter((e) => e.t >= t0);
  const t1 = Math.max(times[times.length - 1] ?? 0, ...inRange.map((e) => e.t), t0 + 1);
  const vals = shown.map((p) => p.sohPct);
  const lo = Math.floor(Math.min(...vals, limitPct) - 2);
  const hi = Math.min(100, Math.ceil(Math.max(...vals, limitPct) + 2));
  const x = (t: number) => m.left + ((t - t0) / (t1 - t0)) * plotW;
  const y = (v: number) => m.top + plotH - ((v - lo) / (hi - lo)) * plotH;
  const yTicks = [lo, (lo + hi) / 2, hi];
  const nXTicks = Math.max(2, Math.min(5, Math.floor(plotW / 90)));
  const xTicks = Array.from({ length: nXTicks }, (_, i) => t0 + ((t1 - t0) * i) / (nXTicks - 1));
  const line = shown.map((p, i) => `${i ? 'L' : 'M'}${x(times[i]!).toFixed(1)},${y(p.sohPct).toFixed(1)}`).join(' ');
  const sel = hover === null ? null : shown[hover];

  const nearest = (clientX: number, el: SVGSVGElement) => {
    const px = clientX - el.getBoundingClientRect().left;
    let best = 0;
    let dist = Infinity;
    times.forEach((t, i) => {
      const d = Math.abs(x(t) - px);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    setHover(best);
  };
  return (
    <div>
      <div role="group" aria-label="Range" className="mb-3 flex flex-wrap gap-px">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            aria-pressed={range === r.key}
            onClick={() => {
              setRange(r.key);
              setHover(null);
            }}
            className={cn(
              'h-8 px-3 text-xs leading-4',
              range === r.key
                ? 'bg-cds-text-primary text-cds-text-on-color'
                : 'bg-cds-layer-selected text-cds-text-primary hover:bg-cds-layer-hover',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div ref={ref} className="relative" hidden={asTable}>
        {width > 0 ? (
          <div
            role="group"
            aria-label={`Health reported by BMS over time, ${shown.length} values. Use Show as table to read each value.`}
            className="outline-offset-2 "
          >
            <svg
              width={width}
              height={H}
              className="block"
              aria-hidden="true"
              onPointerMove={(e) => nearest(e.clientX, e.currentTarget)}
              onPointerLeave={() => setHover(null)}
            >
              {yTicks.map((t) => (
                <g key={t}>
                  <line x1={m.left} x2={m.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--cds-border-subtle)" strokeWidth={1} />
                  <text x={m.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="tnum fill-cds-text-secondary text-[11px]">
                    {num(t, t % 1 ? 1 : 0)}
                  </text>
                </g>
              ))}
              <text
                transform={`translate(10 ${m.top + plotH / 2}) rotate(-90)`}
                textAnchor="middle"
                className="fill-cds-text-secondary text-[11px]"
              >
                Health (reported by BMS) (%)
              </text>
              <line x1={m.left} x2={m.left + plotW} y1={y(lo)} y2={y(lo)} stroke="var(--cds-text-secondary)" strokeWidth={1} />
              {xTicks.map((t) => (
                <text key={t} x={x(t)} y={y(lo) + 14} textAnchor="middle" className="tnum fill-cds-text-secondary text-[11px]">
                  {shortDate(t)}
                </text>
              ))}
              <text x={m.left + plotW / 2} y={H - 4} textAnchor="middle" className="fill-cds-text-secondary text-[11px]">
                Date the BMS sent it
              </text>

              {/* The example rule line. */}
              <line
                x1={m.left}
                x2={m.left + plotW}
                y1={y(limitPct)}
                y2={y(limitPct)}
                stroke="var(--cds-text-primary)"
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <text x={m.left + plotW} y={y(limitPct) - 4} textAnchor="end" className="fill-cds-text-primary text-[11px]">
                {limitLabel}
              </text>

              {shown.length > 1 ? (
                <path d={line} fill="none" stroke="var(--cds-data-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              ) : null}
              {shown.length === 1 ? <circle cx={x(times[0]!)} cy={y(vals[0]!)} r={3} fill="var(--cds-data-1)" /> : null}

              {/* Warning events: a diamond on the time axis with a hairline up to the plot. */}
              {inRange.map((e) => (
                <g key={`${e.at}${e.label}`}>
                  <line x1={x(e.t)} x2={x(e.t)} y1={m.top} y2={y(lo)} stroke="var(--cds-text-primary)" strokeWidth={1} strokeDasharray="1 3" />
                  <path
                    d={`M${x(e.t)},${y(lo) + 20} l5,5 l-5,5 l-5,-5 Z`}
                    fill="var(--cds-text-primary)"
                  />
                </g>
              ))}

              {sel ? (
                <g>
                  <line x1={x(times[hover!]!)} x2={x(times[hover!]!)} y1={m.top} y2={y(lo)} stroke="var(--cds-text-secondary)" strokeWidth={1} />
                  <circle cx={x(times[hover!]!)} cy={y(sel.sohPct)} r={4} fill="var(--cds-layer)" stroke="var(--cds-data-1)" strokeWidth={2} />
                </g>
              ) : null}
            </svg>
            {sel ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute z-10 whitespace-nowrap bg-cds-shell-bg px-2 py-1 text-xs text-cds-shell-text"
                style={{
                  left: Math.min(Math.max(0, x(times[hover!]!) - 70), Math.max(0, width - 150)),
                  top: Math.max(0, y(sel.sohPct) - 36),
                }}
              >
                <span className="tnum">
                  {dateTime(sel.observedAt)}: {num(sel.sohPct, 1)}%
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ height: H }} />
        )}
        <p className="tnum mt-1 min-h-4 text-xs leading-4 text-cds-text-secondary" aria-live="polite">
          {sel ? `${dateTime(sel.observedAt)}: ${num(sel.sohPct, 1)}%` : ' '}
        </p>
      </div>

      {asTable ? (
        <div className="max-h-[260px] overflow-auto">
          <Table>
            <caption className="sr-only">Health (reported by BMS), one row per reading</caption>
            <TableHeader>
              <tr>
                <TableHead>Reported</TableHead>
                <TableHead numeric>Health (%)</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {[...shown].reverse().map((p) => (
                <TableRow key={p.observedAt}>
                  <TableCell className="tnum">{dateTime(p.observedAt)}</TableCell>
                  <TableCell numeric>{num(p.sohPct, 1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {inRange.length ? (
        <ul className="mt-2 space-y-0.5 text-xs leading-4 text-cds-text-secondary">
          {inRange.map((e) => (
            <li key={`${e.at}${e.label}`} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-2 w-2 rotate-45 bg-cds-text-primary" />
              <span>
                Warning event, {dateTime(e.at)}: {e.label}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={() => setAsTable((v) => !v)}
        aria-pressed={asTable}
        className="mt-2 text-xs leading-4 text-cds-interactive underline-offset-2 hover:underline"
      >
        {asTable ? 'Show as chart' : 'Show as table'}
      </button>
    </div>
  );
}
