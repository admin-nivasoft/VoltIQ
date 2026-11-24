import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Kind = 'error' | 'warning' | 'success' | 'info';

const STYLE: Record<Kind, { box: string; icon: typeof Info; iconClass: string; label: string }> = {
  error: { box: 'border-l-cds-error bg-cds-error-bg', icon: XCircle, iconClass: 'text-cds-error', label: 'Error' },
  warning: {
    box: 'border-l-cds-warning bg-cds-warning-bg',
    icon: AlertTriangle,
    iconClass: 'text-[#8e6a00]',
    label: 'Warning',
  },
  success: {
    box: 'border-l-cds-success bg-cds-success-bg',
    icon: CheckCircle2,
    iconClass: 'text-cds-success',
    label: 'Success',
  },
  info: { box: 'border-l-cds-info bg-cds-info-bg', icon: Info, iconClass: 'text-cds-info', label: 'Information' },
};

/**
 * Carbon inline notification (low contrast): sits in the page next to what it is about, and stays
 * until the problem is gone. Used for anything the user must act on, instead of a toast. The kind is
 * always given in text and by an icon as well as by colour.
 */
export function InlineNotification({
  kind,
  title,
  children,
  action,
  className,
}: {
  kind: Kind;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const s = STYLE[kind];
  const Icon = s.icon;
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex flex-wrap items-start gap-x-3 gap-y-2 border border-l-[3px] border-cds-border-subtle px-4 py-3',
        s.box,
        className,
      )}
    >
      <Icon aria-hidden="true" className={cn('mt-px h-5 w-5 shrink-0', s.iconClass)} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          <span className="sr-only">{s.label}: </span>
          {title}
        </p>
        {children ? <div className="mt-1 text-cds-text-primary">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
