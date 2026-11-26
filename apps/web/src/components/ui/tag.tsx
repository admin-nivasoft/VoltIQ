import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

// Tag: a small label. Never the only carrier of meaning: callers pass text (and an icon
// for status), the colour only reinforces it.
const tagVariants = cva(
  'inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium leading-4 [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      tone: {
        neutral: 'bg-cds-layer-selected text-cds-text-primary',
        outline: 'border border-cds-border-strong bg-transparent text-cds-text-secondary',
        high: 'bg-[var(--cds-tag-high-bg)] text-[var(--cds-tag-high-fg)]',
        medium: 'bg-[var(--cds-tag-medium-bg)] text-[var(--cds-tag-medium-fg)]',
        low: 'bg-[var(--cds-tag-low-bg)] text-[var(--cds-tag-low-fg)]',
        success: 'bg-[var(--cds-tag-success-bg)] text-[var(--cds-tag-success-fg)]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Tag({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof tagVariants>) {
  return <span className={cn(tagVariants({ tone }), className)} {...props} />;
}
