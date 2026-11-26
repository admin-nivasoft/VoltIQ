import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

/** shadcn/ui Skeleton in Linear style: a quiet block with a slow pulse, no spinner. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-cds-layer-selected', className)}
      {...props}
    />
  );
}
