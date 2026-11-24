import { CheckCircle2, Unlink, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Tag } from '../../../components/ui/tag';
import { Tile, TileLabel } from '../../../components/ui/tile';
import type { Basis } from '../../types';
import type { ImportPreview, ImportRow, RowStatus } from '../../types-imports';
import { NotRecorded, SourceTag, Updated, Working } from '../figure';
import { num } from '../format';

const ROW_LIMIT = 200;

const STATUS: Record<RowStatus, { label: string; tone: 'success' | 'high' | 'medium'; icon: typeof XCircle }> = {
  loaded: { label: 'Loaded', tone: 'success', icon: CheckCircle2 },
  rejected: { label: 'Rejected', tone: 'high', icon: XCircle },
  unmatched: { label: 'No battery', tone: 'medium', icon: Unlink },
};

/** Status in words and with an icon, never by colour alone. */
function StatusTag({ status }: { status: RowStatus }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <Tag tone={s.tone}>
      <Icon aria-hidden="true" />
      {s.label}
    </Tag>
  );
}

function matchWord(r: ImportRow) {
  return r.unmatchedReason === 'several_matches' ? 'Several matches' : r.unmatchedReason === 'no_match' ? 'No match' : null;
}

function WhatHappens({ r }: { r: ImportRow }) {
  if (r.status === 'loaded') return <>{r.effect ?? <NotRecorded />}</>;
  const word = matchWord(r);
  return (
    <>
      {word ? <span className="font-semibold">{word}: </span> : null}
      {r.reason ?? <NotRecorded />}
    </>
  );
}

function Count({ label, metricId, basis, value, sub, at }: { label: string; metricId: string; basis: Basis; value: number; sub: string; at: string }) {
  return (
    <Tile className="flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <TileLabel className="pt-1">{label}</TileLabel>
        <Working metricId={metricId} basis={basis} name={label} className="-mr-1 -mt-0.5" />
      </div>
      <p className="tnum mt-2 text-[32px] leading-10">{num(value)}</p>
      <p className="mt-1 text-cds-text-secondary">{sub}</p>
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4">
        <SourceTag source="calculated" />
        <Updated at={at} prefix="Checked" />
      </div>
    </Tile>
  );
}

/** Counts, unknown columns and row table for a checked file, before or after it is imported. */
export function ResultPanel({ p, children }: { p: ImportPreview; children?: ReactNode }) {
  const shown = p.rows.slice(0, ROW_LIMIT);
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Count label="Rows loaded" metricId="import_rows_loaded" basis={p.bases.loaded} value={p.counts.loaded} sub="Passed every check" at={p.calculatedAt} />
        <Count label="Rows rejected" metricId="import_rows_rejected" basis={p.bases.rejected} value={p.counts.rejected} sub="Failed a check; reason shown per row" at={p.calculatedAt} />
        <Count label="Rows with no battery" metricId="import_rows_unmatched" basis={p.bases.unmatched} value={p.counts.unmatched} sub="No single battery matched the ID" at={p.calculatedAt} />
      </div>

      <p className="mt-4 text-cds-text-secondary">
        {p.unknownColumns.length ? (
          <>
            <span className="font-semibold text-cds-text-primary">Unknown columns: {p.unknownColumns.join(', ')}.</span>{' '}
            Kept with each record. Nothing is thrown away.
          </>
        ) : (
          'Every column in this file is recognised.'
        )}
      </p>

      {children}

      <h3 className="mb-2 mt-6 text-base font-semibold">Row by row</h3>
      {p.rows.length === 0 ? (
        <p className="border border-cds-border-subtle px-4 py-6">
          This file has a header but no rows. Add at least one row under the column names and choose it again.
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto border border-cds-border-subtle md:block">
            <Table>
              <caption className="sr-only">Each row of {p.fileName} and what happens to it</caption>
              <TableHeader>
                <tr>
                  <TableHead numeric>Line</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>What happens, or why not</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {shown.map((r) => (
                  <TableRow key={r.line}>
                    <TableCell numeric>{r.line}</TableCell>
                    <TableCell className="break-all font-semibold">{r.key ?? <NotRecorded />}</TableCell>
                    <TableCell><StatusTag status={r.status} /></TableCell>
                    <TableCell><WhatHappens r={r} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="space-y-px md:hidden" aria-label={`Each row of ${p.fileName} and what happens to it`}>
            {shown.map((r) => (
              <li key={r.line} className="bg-cds-layer-2 p-4 outline outline-1 outline-cds-border-subtle">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 break-all font-semibold">{r.key ?? <NotRecorded />}</span>
                  <StatusTag status={r.status} />
                </div>
                <p className="mt-1"><WhatHappens r={r} /></p>
                <p className="tnum mt-0.5 text-xs leading-4 text-cds-text-secondary">Line {r.line}</p>
              </li>
            ))}
          </ul>
          {p.rows.length > ROW_LIMIT ? (
            <p className="mt-2 text-xs leading-4 text-cds-text-secondary">
              Showing the first {num(ROW_LIMIT)} of {num(p.rows.length)} rows. The counts above cover every row.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
