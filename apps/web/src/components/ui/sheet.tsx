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
    <DialogPrimitive.Overlay className="bpte fixed inset-0 z-40 bg-[rgba(22,22,22,0.5)]" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'bpte fixed inset-y-0 left-0 z-50 flex w-64 max-w-[85vw] flex-col bg-cds-layer shadow-[0_2px_6px_rgba(0,0,0,0.3)] outline-none',
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className="absolute right-0 top-0 inline-flex h-12 w-12 items-center justify-center text-cds-text-primary hover:bg-cds-layer-hover"
        aria-label="Close menu"
      >
        <X aria-hidden="true" className="h-5 w-5" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = 'SheetContent';
