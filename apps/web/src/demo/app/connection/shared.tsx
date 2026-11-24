import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Updated } from '../figure';

export const CONNECTION_KEY = ['demo', 'connection'] as const;

export function SectionHeading({
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
        <h2 id={id} className="text-xl leading-7">
          {title}
        </h2>
        {children ? <p className="mt-0.5 text-cds-text-secondary">{children}</p> : null}
      </div>
      {updated ? <Updated at={updated.at} prefix={updated.prefix} /> : null}
    </div>
  );
}

export const BatteryLink = ({ id, serial }: { id: string; serial: string }) => (
  <Link to={`/batteries/${id}`} className="font-semibold text-cds-interactive hover:underline">
    {serial}
  </Link>
);

