import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { InlineNotification } from '../../../components/ui/inline-notification';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { ApiError, apiFetch } from '../../../lib/api/client';
import { describeError } from '../../../components/ui/states';
import { LinkResultSchema, type Connection, type LinkResult } from '../../types-connection';
import { SourceTag, Updated, Working } from '../figure';
import { ago, dateTime, num, plural } from '../format';
import { useDemoCan } from '../session';
import { SectionHeading } from './shared';

type Unmatched = Connection['unmatched'][number];

function LinkForm({
  u,
  options,
  onDone,
  onCancel,
}: {
  u: Unmatched;
  options: Connection['linkable'];
  onDone: (r: LinkResult) => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const [batteryId, setBatteryId] = useState('');
  const link = useMutation({
    mutationFn: () =>
      apiFetch(`/connection/unmatched/${u.unmatchedId}/link`, {
        method: 'POST',
        body: { batteryId },
        schema: LinkResultSchema,
      }),
    onSuccess: async (r) => {
      onDone(r);
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'demo' });
    },
  });
  const id = `link-${u.unmatchedId}`;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (batteryId) link.mutate();
      }}
    >
      <label className="flex flex-col gap-1" htmlFor={id}>
        <span className="text-xs leading-4 text-cds-text-secondary">Battery (factory serial) for {u.idValue}</span>
        <select
          id={id}
          value={batteryId}
          onChange={(e) => setBatteryId(e.target.value)}
          className="h-10 min-w-[200px] border-b border-cds-border-strong bg-cds-layer-2 px-3 text-sm"
        >
          <option value="">Choose a battery</option>
          {options.map((o) => (
            <option key={o.batteryId} value={o.batteryId}>{o.factorySerial}</option>
          ))}
        </select>
      </label>
      <Button type="submit" size="md" disabled={!batteryId || link.isPending}>
        {link.isPending ? 'Linking…' : 'Link ID'}
      </Button>
      <Button type="button" size="md" variant="ghost" onClick={onCancel}>Cancel</Button>
      {link.isError ? (
        <p role="alert" className="w-full text-cds-error">
          {link.error instanceof ApiError && link.error.status === 404
            ? 'That battery or battery ID is no longer available. Reload and try again.'
            : describeError(link.error)}
        </p>
      ) : null}
    </form>
  );
}

export function UnmatchedSection({ c }: { c: Connection }) {
  const canManage = useDemoCan('connection.manage');
  const [open, setOpen] = useState<string | null>(null);
  const [done, setDone] = useState<LinkResult | null>(null);
  const u = c.unmatched;

  return (
    <section aria-labelledby="unmatched" className="mb-8 scroll-mt-16">
      <SectionHeading id="unmatched" title="Unrecognised battery IDs" updated={{ at: c.bases.lastSeen.calculatedAt, prefix: 'Worked out' }}>
        We keep data from these IDs. An Admin can link each ID to a battery.
      </SectionHeading>
      {done ? (
        <InlineNotification kind="success" title={`${done.idValue} is linked to ${done.factorySerial}`} className="mb-3">
          The {plural(done.messagesReplayed, 'waiting message')} is now linked to this battery.
        </InlineNotification>
      ) : null}
      {u.length ? (
        <>
          <div tabIndex={0} role="region" aria-label="Unrecognised battery IDs, scrollable" className="hidden overflow-x-auto border border-cds-border-subtle md:block">
            <Table>
              <caption className="sr-only">Unrecognised battery IDs</caption>
              <TableHeader>
                <tr>
                  <TableHead>Battery ID</TableHead>
                  <TableHead numeric>Messages waiting</TableHead>
                  <TableHead>First seen</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead>{canManage ? 'Action' : ''}</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {u.map((r) => (
                  <TableRow key={r.unmatchedId}>
                    <TableCell className="font-semibold">{r.idValue}</TableCell>
                    <TableCell numeric>{num(r.messagesHeld)}</TableCell>
                    <TableCell className="whitespace-nowrap"><time dateTime={r.firstSeenAt} title={dateTime(r.firstSeenAt)}>{ago(r.firstSeenAt)}</time></TableCell>
                    <TableCell className="whitespace-nowrap"><time dateTime={r.lastSeenAt} title={dateTime(r.lastSeenAt)}>{ago(r.lastSeenAt)}</time></TableCell>
                    <TableCell>
                      {canManage ? (
                        open === r.unmatchedId ? null : (
                          <Button size="sm" variant="tertiary" onClick={() => { setOpen(r.unmatchedId); setDone(null); }}>
                            Link to a battery
                          </Button>
                        )
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="space-y-px md:hidden" aria-label="Unrecognised battery IDs">
            {u.map((r) => (
              <li key={r.unmatchedId} className="bg-cds-layer-2 p-4 outline outline-1 outline-cds-border-subtle">
                <p className="font-semibold">{r.idValue}</p>
                <p className="tnum text-xs leading-4 text-cds-text-secondary">
                  {plural(r.messagesHeld, 'message')} waiting · first seen {ago(r.firstSeenAt)} · last seen {ago(r.lastSeenAt)}
                </p>
                {canManage && open !== r.unmatchedId ? (
                  <Button className="mt-2" size="sm" variant="tertiary" onClick={() => { setOpen(r.unmatchedId); setDone(null); }}>
                    Link to a battery
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {canManage && open ? (
            <div className="mt-2 border border-cds-border-subtle bg-cds-layer p-4">
              {(() => {
                const sel = u.find((x) => x.unmatchedId === open);
                return sel ? (
                  <LinkForm
                    key={sel.unmatchedId}
                    u={sel}
                    options={c.linkable}
                    onCancel={() => setOpen(null)}
                    onDone={(r) => { setDone(r); setOpen(null); }}
                  />
                ) : null;
              })()}
            </div>
          ) : null}
          {!canManage ? (
            <p className="mt-2 text-xs leading-4 text-cds-text-secondary">Only an Admin can link a battery ID to a battery.</p>
          ) : null}
        </>
      ) : (
        <p className="border border-cds-border-subtle px-4 py-6">Every battery ID that sent data is recognised.</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <SourceTag source="calculated" />
        <Working metricId="unmatched_id_count" basis={c.bases.unmatched} name="Unrecognised battery IDs" />
        <Updated at={c.bases.unmatched.calculatedAt} prefix="Updated" />
      </div>
    </section>
  );
}
