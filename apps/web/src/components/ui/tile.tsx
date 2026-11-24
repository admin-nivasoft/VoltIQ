import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

/**
 * shadcn/ui Card, renamed to Carbon's "tile": a flat layer step with no shadow and square corners.
 * Structure comes from the background step and a hairline border, not depth.
 */
export const Tile = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('bg-cds-layer p-4', className)} {...props} />
  ),
);
Tile.displayName = 'Tile';

export function TileHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-2', className)} {...props} />;
}

/** Carbon label-01: 12/16, used for a tile's label. */
export function TileLabel({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('text-xs leading-4 tracking-[0.32px] text-cds-text-secondary', className)}
      {...props}
    />
  );
}
