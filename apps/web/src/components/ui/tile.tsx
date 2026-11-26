import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

/**
 * shadcn/ui Card as a tile: 1px border, 8px radius, no shadow.
 * Structure comes from the hairline border, not depth.
 */
export const Tile = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    // min-w-0: inside a grid or flex row a tile may shrink below its content's width (its own tables
    // and charts scroll or reflow), so a wide child never pushes the page sideways on a phone.
    <div ref={ref} className={cn('min-w-0 rounded-lg border border-cds-border-subtle bg-cds-layer-2 p-4', className)} {...props} />
  ),
);
Tile.displayName = 'Tile';

export function TileHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-2', className)} {...props} />;
}

/** Label: 12/16, used for a tile's label. */
export function TileLabel({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('text-xs leading-4 text-cds-text-secondary', className)}
      {...props}
    />
  );
}
