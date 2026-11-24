import { useLayoutEffect, useRef, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import type { Distribution } from '../../types';
import { num } from '../format';

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

const niceMax = (v: number) => {
  if (v <= 5) return 5;
  const step = v <= 10 ? 2 : v <= 25 ? 5 : 10;
  return Math.ceil(v / step) * step;
};

/**
 * A plain histogram: one series in the single accent, hairline grid, labelled axes with units, a
 * hover readout per band, and an optional reference line (a rule threshold or the median). Bands
 * touch, separated by a 2px surface gap. The same numbers are always available as a table.
 */
export function Histogram({
  dist,
  unit,
  xTitle,
  formatBand,
  reference,
  tableCaption,
}: {
  dist: Distribution;
  /** Unit for the band labels, e.g. "%" or "". */
  unit: string;
  xTitle: string;
  formatBand: (from: number, to: number) => string;
  reference?: { value: number; label: string };
  tableCaption: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const bands = dist.bands;
  const H = 188;
  const m = { top: 20, right: 16, bottom: 40, left: 36 };
  const plotW = Math.max(0, width - m.left - m.right);
  const plotH = H - m.top - m.bottom;
  const maxCount = niceMax(Math.max(1, ...bands.map((b) => b.count)));
  const ticks = [0, maxCount / 2, maxCount];
  const lo = bands[0]?.from ?? 0;
  const hi = bands[bands.length - 1]?.to ?? 1;
  const x = (v: number) => m.left + ((v - lo) / (hi - lo)) * plotW;
  const y = (c: number) => m.top + plotH - (c / maxCount) * plotH;
  // Label every band edge that fits: at least 40px apart.
  const slot = bands.length ? plotW / bands.length : plotW;
  const every = Math.max(1, Math.ceil(40 / Math.max(1, slot)));
  const edges = [...bands.map((b) => b.from), hi].filter((_, i) => i % every === 0);
  const hovered = hover === null ? null : bands[hover];

  return (
    <div>
      <div ref={ref} className="relative" hidden={asTable}>
        {width > 0 ? (
          <svg
            width={width}
            height={H}
            role="img"
            aria-label={`${xTitle}: ${bands.map((b) => `${formatBand(b.from, b.to)} ${b.count}`).join(', ')}`}
            className="block"
            onPointerLeave={() => setHover(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.left} x2={m.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--cds-border-subtle)" strokeWidth={1} />
                <text x={m.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="tnum fill-cds-text-secondary text-[11px]">
                  {num(t)}
                </text>
              </g>
            ))}
            <text
              transform={`translate(10 ${m.top + plotH / 2}) rotate(-90)`}
              textAnchor="middle"
              className="fill-cds-text-secondary text-[11px]"
            >
              Batteries
            </text>
            {bands.map((b, i) => {
              const x0 = x(b.from) + 1;
              const w = Math.max(1, x(b.to) - x(b.from) - 2);
              return (
                <g key={b.from} onPointerEnter={() => setHover(i)}>
                  {/* Hit target: the whole band column, bigger than the bar. */}
                  <rect x={x0 - 1} y={m.top} width={w + 2} height={plotH} fill="transparent" />
                  {b.count > 0 ? (
                    <path
                      d={`M${x0},${y(0)} V${y(b.count) + 2} q0,-2 2,-2 H${x0 + w - 2} q2,0 2,2 V${y(0)} Z`}
                      fill="var(--cds-data-1)"
                      opacity={hover === null || hover === i ? 1 : 0.55}
                    />
                  ) : null}
                </g>
              );
            })}
            <line x1={m.left} x2={m.left + plotW} y1={y(0)} y2={y(0)} stroke="var(--cds-text-secondary)" strokeWidth={1} />
            {edges.map((e) => (
              <text key={e} x={x(e)} y={y(0) + 14} textAnchor="middle" className="tnum fill-cds-text-secondary text-[11px]">
                {num(e)}
              </text>
            ))}
            <text x={m.left + plotW / 2} y={H - 4} textAnchor="middle" className="fill-cds-text-secondary text-[11px]">
              {xTitle}
            </text>
            {reference && reference.value >= lo && reference.value <= hi ? (
              <g>
                <line
                  x1={x(reference.value)}
                  x2={x(reference.value)}
                  y1={m.top - 6}
                  y2={y(0)}
                  stroke="var(--cds-text-primary)"
                  strokeWidth={1}
                />
                <text
                  x={x(reference.value) + 4}
                  y={m.top - 8}
                  textAnchor={x(reference.value) > m.left + plotW * 0.6 ? 'end' : 'start'}
                  dx={x(reference.value) > m.left + plotW * 0.6 ? -8 : 0}
                  className="fill-cds-text-primary text-[11px]"
                >
                  {reference.label}
                </text>
              </g>
            ) : null}
          </svg>
        ) : (
          <div style={{ height: H }} />
        )}
        {hovered ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-10 whitespace-nowrap bg-cds-shell-bg px-2 py-1 text-xs text-cds-shell-text"
            style={{
              left: Math.min(Math.max(0, x(hovered.from + (hovered.to - hovered.from) / 2) - 60), Math.max(0, width - 130)),
              top: Math.max(0, y(hovered.count) - 34),
            }}
          >
            <span className="tnum">
              {formatBand(hovered.from, hovered.to)}
              {unit}: {num(hovered.count)} {hovered.count === 1 ? 'battery' : 'batteries'}
            </span>
          </div>
        ) : null}
      </div>
      {asTable ? (
        <div className="max-h-[188px] overflow-auto">
          <Table>
            <caption className="sr-only">{tableCaption}</caption>
            <TableHeader>
              <tr>
                <TableHead>Band ({unit || 'count'})</TableHead>
                <TableHead numeric>Batteries</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {bands.map((b) => (
                <TableRow key={b.from}>
                  <TableCell className="tnum">{formatBand(b.from, b.to)}</TableCell>
                  <TableCell numeric>{num(b.count)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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
