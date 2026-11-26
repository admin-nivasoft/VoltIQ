import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';

// shadcn/ui Sheet (a Radix dialog that slides in from the side), used for the side nav on small screens.
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

export const SheetContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="bpte fixed inset-0 z-40 bg-[var(--cds-overlay)]" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'bpte bpte-pop-in fixed inset-y-0 left-0 z-50 flex w-64 max-w-[85vw] flex-col border-r border-cds-border-subtle bg-cds-layer shadow-cds-pop outline-none',
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-cds-text-primary hover:bg-cds-layer-hover"
        aria-label="Close menu"
      >
        <X aria-hidden="true" className="h-5 w-5" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = 'SheetContent';
