import { Calculator, Clock, Cpu, FileText, Info, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { Toggletip } from '../../components/ui/popover';
import { Tag } from '../../components/ui/tag';
import { cn } from '../../lib/cn';
import type { Basis, MetricDefinition, Source } from '../types';
import { ago, dateTime } from './format';
import { useMetrics } from './session';

const SOURCE: Record<Source, { label: string; icon: typeof Cpu }> = {
  bms: { label: 'From BMS', icon: Cpu },
  calculated: { label: 'Calculated', icon: Calculator },
  registered: { label: 'Registered', icon: FileText },
};
const INPUT_FROM = {
  bms: 'BMS data',
  calculated: 'Calculated',
  registered: 'Registered',
  setting: 'Example setting',
} as const;

/** Where a figure comes from, in text and with an icon. */
export function SourceTag({ source, className }: { source: Source; className?: string }) {
  const s = SOURCE[source];
  const Icon = s.icon;
  return (
    <Tag tone="outline" className={className}>
      <Icon aria-hidden="true" />
      {s.label}
    </Tag>
  );
}

/** "Updated 11 min ago", with the exact time on hover and for screen readers. */
export function Updated({ at, prefix = 'Updated' }: { at: string; prefix?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs leading-4 tracking-[0.32px] text-cds-text-helper">
      <Clock aria-hidden="true" className="h-3.5 w-3.5" />
      <time dateTime={at} title={dateTime(at)}>
        {prefix} {ago(at)}
      </time>
    </span>
  );
}

/** Missing data reads as words, never as 0 or a blank. */
export function NotRecorded({ children = 'Not recorded' }: { children?: ReactNode }) {
  return <span className="text-cds-text-helper">{children}</span>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-3 first:mt-0">
      <p className="text-xs font-semibold leading-4 tracking-[0.32px] text-cds-text-secondary">{title}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function WorkingBody({ def, basis }: { def: MetricDefinition; basis?: Basis }) {
  const calculated = def.source === 'calculated';
  return (
    <div className="text-sm leading-[18px]">
      <p className="font-semibold">{def.label}</p>
      <p className="mt-0.5 text-xs leading-4 text-cds-text-secondary">
        {SOURCE[def.source].label} · metric <code className="font-plex">{def.metricId}</code> · version{' '}
        {def.version} ({def.status})
      </p>
      <Section title={calculated ? 'How it is worked out' : 'Where it comes from'}>
        <p>{def.words}</p>
        <p className="tnum mt-2 bg-cds-layer px-2 py-1.5 text-[13px]">{def.symbols}</p>
      </Section>
      <Section title="Inputs">
        <ul className="space-y-1">
          {def.inputs.map((i) => (
            <li key={i.name} className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span>{i.name}</span>
              <span className="inline-flex items-center gap-1 text-xs text-cds-text-helper">
                {i.from === 'setting' ? <SlidersHorizontal aria-hidden="true" className="h-3 w-3" /> : null}
                {INPUT_FROM[i.from]}
              </span>
            </li>
          ))}
        </ul>
      </Section>
      {basis ? (
        <>
          <Section title="Based on">
            <p>{basis.basedOn}</p>
          </Section>
          <Section title="Less reliable when">
            {basis.caveats.length ? (
              <ul className="list-disc space-y-1 pl-4">
                {basis.caveats.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : (
              <p>Nothing reduces confidence in this figure at the moment.</p>
            )}
          </Section>
          <p className="mt-3 text-xs leading-4 text-cds-text-helper">
            {calculated ? 'Calculated' : 'Read'} {dateTime(basis.calculatedAt)}
          </p>
        </>
      ) : null}
    </div>
  );
}

/**
 * The "show the working" panel for one figure: opens on hover, keyboard focus and tap. Looks the
 * metric up in the dictionary (GET /metrics), so the formula shown is the versioned definition.
 */
export function Working({
  metricId,
  basis,
  name,
  className,
}: {
  metricId: string;
  basis?: Basis;
  /** What the figure is called on screen, for the button's accessible name. */
  name: string;
  className?: string;
}) {
  const metrics = useMetrics();
  const def = metrics.data?.items.find((d) => d.metricId === metricId);
  const verb = def?.source === 'calculated' ? 'is worked out' : 'comes from';
  return (
    <span className={cn('inline-flex', className)}>
      <Toggletip label={`How ${name} ${verb}`} trigger={<Info aria-hidden="true" className="h-4 w-4" />}>
        {def ? (
          <WorkingBody def={def} basis={basis} />
        ) : metrics.isError ? (
          <p>The metric dictionary could not be loaded. Reload the page to try again.</p>
        ) : (
          <p>Loading the definition…</p>
        )}
      </Toggletip>
    </span>
  );
}
