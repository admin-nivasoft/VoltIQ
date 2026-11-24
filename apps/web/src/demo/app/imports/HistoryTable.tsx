import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Tag } from '../../../components/ui/tag';
import type { Basis } from '../../types';
import type { ImportHistoryEntryDto } from '../../types-imports';
import { NotRecorded, SourceTag, Working } from '../figure';
import { ago, dateTime, num } from '../format';
import { KIND_LABEL } from './labels';

function When({ at }: { at: string }) {
  return (
    <time dateTime={at} title={dateTime(at)}>
      {dateTime(at)} <span className="text-cds-text-helper">({ago(at)})</span>
    </time>
  );
}

const FIG = {
  loaded: { id: 'import_rows_loaded', name: 'Rows loaded', caveat: null },
  rejected: {
    id: 'import_rows_rejected',
    name: 'Rows rejected',
    caveat: 'Each rejected row has its own reason; other rows still loaded.',
  },
  unmatched: {
    id: 'import_rows_unmatched',
    name: 'Rows with no battery',
    caveat: 'Matching is exact only, so a near-miss ID stays unrecognised until an Admin fixes it.',
  },
} as const;
type FigKey = keyof typeof FIG;

/** One count with its working. Fresh as of the import time shown in the When column. */
function Fig({ e, k }: { e: ImportHistoryEntryDto; k: FigKey }) {
  const f = FIG[k];
  const value = k === 'loaded' ? e.rowsLoaded : k === 'rejected' ? e.rowsRejected : e.rowsUnmatched;
  const basis: Basis = {
    metricId: f.id,
    calculatedAt: e.at,
    basedOn: `Rows of ${e.fileName}, imported ${dateTime(e.at)} by ${e.by}.`,
    caveats: f.caveat ? [f.caveat] : [],
  };
  return (
    <span className="inline-flex items-center gap-1">
      {num(value)}
      <Working metricId={f.id} basis={basis} name={`${f.name} in ${e.fileName}`} />
    </span>
  );
}

function Unknown({ cols }: { cols: string[] }) {
  return cols.length ? <span className="break-words">{cols.join(', ')}</span> : <NotRecorded>None</NotRecorded>;
}

/** Who imported what and when (SCR-06-FR-04). A table from md up, cards on a phone. */
export function HistoryTable({ entries }: { entries: ImportHistoryEntryDto[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto border border-cds-border-subtle md:block">
        <Table>
          <caption className="sr-only">Import history, newest first</caption>
          <TableHeader>
            <tr>
              <TableHead>File</TableHead>
              <TableHead>Imported by</TableHead>
              <TableHead>When</TableHead>
              <TableHead numeric>
                Loaded
              </TableHead>
              <TableHead numeric>
                Rejected
              </TableHead>
              <TableHead numeric>
                No battery
              </TableHead>
              <TableHead>Unknown columns</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.importId}>
                <TableCell>
                  <span className="block break-all font-semibold">{e.fileName}</span>
                  <Tag tone="neutral" className="mt-1">{KIND_LABEL[e.kind]}</Tag>
                </TableCell>
                <TableCell>{e.by}</TableCell>
                <TableCell className="whitespace-nowrap"><When at={e.at} /></TableCell>
                <TableCell numeric><Fig e={e} k="loaded" /></TableCell>
                <TableCell numeric><Fig e={e} k="rejected" /></TableCell>
                <TableCell numeric><Fig e={e} k="unmatched" /></TableCell>
                <TableCell><Unknown cols={e.unknownColumns} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="space-y-px md:hidden" aria-label="Import history, newest first">
        {entries.map((e) => (
          <li key={e.importId} className="bg-cds-layer-2 p-4 outline outline-1 outline-cds-border-subtle">
            <p className="break-all font-semibold">{e.fileName}</p>
            <Tag tone="neutral" className="mt-1">{KIND_LABEL[e.kind]}</Tag>
            <p className="mt-2 text-xs leading-4 text-cds-text-secondary">
              {e.by} · <When at={e.at} />
            </p>
            <dl className="tnum mt-2 grid grid-cols-3 gap-2">
              {(
                [
                  ['loaded', 'Loaded'],
                  ['rejected', 'Rejected'],
                  ['unmatched', 'No battery'],
                ] as const satisfies readonly (readonly [FigKey, string])[]
              ).map(([k, label]) => (
                <div key={k}>
                  <dt className="text-xs leading-4 text-cds-text-secondary">{label}</dt>
                  <dd className="text-xl leading-7"><Fig e={e} k={k} /></dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs leading-4 text-cds-text-secondary">
              Unknown columns: <Unknown cols={e.unknownColumns} />
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <SourceTag source="calculated" />
        <span className="text-xs leading-4 text-cds-text-secondary">
          Row counts are worked out when each file is checked. Select the information icon beside a column for how.
        </span>
      </div>
    </>
  );
}
