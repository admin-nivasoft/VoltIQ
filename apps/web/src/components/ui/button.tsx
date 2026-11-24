import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

// shadcn/ui Button, themed to Carbon: square corners, 48px/40px/32px heights, left-aligned label.
const buttonVariants = cva(
  'inline-flex items-center gap-2 whitespace-nowrap rounded-none font-plex text-sm transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-cds-interactive text-cds-text-on-color hover:bg-cds-interactive-hover',
        secondary: 'bg-[#393939] text-cds-text-on-color hover:bg-[#474747]',
        tertiary:
          'border border-cds-interactive text-cds-interactive hover:bg-cds-interactive hover:text-cds-text-on-color',
        ghost: 'text-cds-interactive hover:bg-cds-layer-hover',
      },
      size: {
        lg: 'h-12 px-4',
        md: 'h-10 px-4',
        sm: 'h-8 px-3',
        icon: 'h-10 w-10 justify-center',
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
