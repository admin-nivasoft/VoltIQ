import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

/**
 * shadcn/ui Table, themed to Carbon's data table: compact 32px rows, row dividers, a sticky header on
 * a grey layer, clear hover. Numbers are right-aligned with tabular figures (pass `numeric`).
 */
export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full border-collapse text-left text-sm', className)} {...props} />;
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('sticky top-0 z-10 bg-cds-layer-selected', className)} {...props} />;
}

export function TableBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('border-b border-cds-border-subtle bg-cds-layer-2 hover:bg-cds-layer-hover', className)}
      {...props}
    />
  );
}

export function TableHead({
  className,
  numeric,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        'h-8 whitespace-nowrap px-4 font-semibold text-cds-text-primary',
        numeric && 'text-right',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  numeric,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn('h-8 px-4 py-1.5 align-middle', numeric && 'tnum text-right', className)}
      {...props}
    />
  );
}

/**
 * A sortable column header. The button names the column and the current order, and aria-sort on the
 * header cell tells assistive technology which column the table is sorted by.
 */
export function SortableHead({
  children,
  active,
  dir,
  onSort,
  numeric,
  className,
}: {
  children: ReactNode;
  active: boolean;
  dir: 'asc' | 'desc';
  onSort: () => void;
  numeric?: boolean;
  className?: string;
}) {
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('h-8 p-0 font-semibold', className)}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          'flex min-h-8 w-full items-center gap-1 px-4 py-1 hover:bg-cds-layer-hover',
          numeric && 'justify-end text-right',
        )}
      >
        {children}
        <Icon
          aria-hidden="true"
          className={cn('h-4 w-4 shrink-0', active ? 'text-cds-text-primary' : 'text-cds-text-helper')}
        />
      </button>
    </th>
  );
}
