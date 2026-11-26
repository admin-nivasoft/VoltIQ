import * as PopoverPrimitive from '@radix-ui/react-popover';
import { forwardRef, useId, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

// shadcn/ui Popover, Linear-style: 8px radius, hairline border, soft shadow (popovers and sheets only).
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export const PopoverContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'start', sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={16}
      className={cn(
        'bpte bpte-pop-in z-50 max-h-[var(--radix-popover-content-available-height)] w-[min(22rem,calc(100vw-32px))] overflow-y-auto rounded-lg border border-cds-border-subtle bg-cds-layer-2 p-4 text-left text-cds-text-primary shadow-cds-pop outline-none',
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = 'PopoverContent';

/**
 * A toggletip: opens on mouse hover, on keyboard focus, and on tap, so the same explanation is
 * reachable with a mouse, a keyboard or a finger (a plain tooltip cannot be opened by touch).
 * Focus stays on the trigger, Escape closes it, and the content is linked with aria-describedby
 * while it is open so screen readers announce it.
 */
export function Toggletip({
  label,
  trigger,
  children,
  contentClassName,
}: {
  /** Accessible name of the trigger, e.g. "How Fleet health is calculated". */
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false); // opened by a click or tap: hover-out does not close it
  const leaveTimer = useRef<number | undefined>(undefined);
  const id = useId();

  const cancelLeave = () => window.clearTimeout(leaveTimer.current);
  const scheduleClose = () => {
    cancelLeave();
    leaveTimer.current = window.setTimeout(() => {
      if (!pinned.current) setOpen(false);
    }, 150);
  };
  const change = (next: boolean) => {
    if (!next) pinned.current = false;
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={change}>
      <PopoverTrigger
        aria-label={label}
        aria-describedby={open ? id : undefined}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-cds-text-secondary hover:bg-cds-layer-hover hover:text-cds-text-primary"
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse') return;
          cancelLeave();
          setOpen(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') scheduleClose();
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (!pinned.current) setOpen(false);
        }}
        onClick={(e) => {
          // A click (or tap) pins it open; a second click closes it. Radix would toggle, so take over.
          e.preventDefault();
          if (open && pinned.current) change(false);
          else {
            pinned.current = true;
            setOpen(true);
          }
        }}
      >
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        id={id}
        role="tooltip"
        // The panel can be taller than a phone screen and then scrolls; focusable so a keyboard can scroll it.
        tabIndex={0}
        className={contentClassName}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerEnter={cancelLeave}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') scheduleClose();
        }}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
