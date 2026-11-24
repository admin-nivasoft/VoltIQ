import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

// Carbon tag: a small, flat label. Never the only carrier of meaning: callers pass text (and an icon
// for status), the colour only reinforces it.
const tagVariants = cva(
  'inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-cds px-2 text-xs leading-4 tracking-[0.32px] [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      tone: {
        neutral: 'bg-cds-layer-selected text-cds-text-primary',
        outline: 'border border-cds-border-strong bg-transparent text-cds-text-secondary',
        high: 'bg-[#ffd7d9] text-[#750e13]',
        medium: 'bg-[#fcf4d6] text-[#483700]',
        low: 'bg-[#d0e2ff] text-[#002d9c]',
        success: 'bg-[#defbe6] text-[#044317]',
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
