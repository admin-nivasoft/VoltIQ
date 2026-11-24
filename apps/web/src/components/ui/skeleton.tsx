import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

/** shadcn/ui Skeleton in Carbon's style: a flat grey block with a slow shimmer, no spinner. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-none bg-cds-layer-selected', className)}
      {...props}
    />
  );
}
