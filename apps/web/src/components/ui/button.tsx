import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

// shadcn/ui Button, Linear-style: 6px radius, compact heights.
const buttonVariants = cva(
  'inline-flex items-center gap-2 whitespace-nowrap rounded-md font-plex text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-cds-interactive bg-[image:var(--cds-btn-bg)] text-white shadow-sm hover:bg-cds-interactive-hover hover:bg-[image:var(--cds-btn-bg-hover)]',
        secondary: 'border border-cds-border-strong bg-cds-layer-2 text-cds-text-primary hover:bg-cds-layer-hover',
        tertiary:
          'border border-cds-border-strong text-cds-text-primary hover:bg-cds-layer-hover',
        ghost: 'text-cds-text-secondary hover:text-cds-text-primary hover:bg-cds-layer-hover',
      },
      size: {
        lg: 'h-10 px-4',
        md: 'h-8 px-3',
        sm: 'h-6 px-2',
        icon: 'h-8 w-8 justify-center',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render the child (for example a router Link) with button styles. */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...(asChild ? {} : { type: type ?? 'button' })}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
