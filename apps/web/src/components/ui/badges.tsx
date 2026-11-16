import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  CircleHelp,
  Clock,
  Info,
  OctagonAlert,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type { Alert, PackSummary } from '@ql/contracts';

// Status is never shown by colour alone (NFR-07): every badge has a visible word and an icon.
function Badge({
  icon: Icon,
  tone,
  children,
}: {
  icon: LucideIcon;
  tone: string;
  children: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium ${tone}`}
    >
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      {children}
    </span>
  );
}

const SEVERITY = {
  high: {
    label: 'High severity',
    icon: OctagonAlert,
    tone: 'border-red-300 bg-red-50 text-red-900',
  },
  medium: {
    label: 'Medium severity',
    icon: TriangleAlert,
    tone: 'border-amber-400 bg-amber-50 text-amber-900',
  },
  low: { label: 'Low severity', icon: Info, tone: 'border-blue-300 bg-blue-50 text-blue-900' },
} as const;

export function SeverityBadge({ severity }: { severity: Alert['severity'] }) {
  const s = SEVERITY[severity];
  return (
    <Badge icon={s.icon} tone={s.tone}>
      {s.label}
    </Badge>
  );
}

const ALERT_STATUS = {
  open: { label: 'Open', icon: Clock, tone: 'border-slate-400 bg-white text-slate-900' },
  acknowledged: {
    label: 'Acknowledged',
    icon: CheckCircle2,
    tone: 'border-green-400 bg-green-50 text-green-900',
  },
  resolved: {
    label: 'Resolved',
    icon: ShieldCheck,
    tone: 'border-slate-300 bg-slate-100 text-slate-800',
  },
} as const;

export function AlertStatusBadge({ status }: { status: Alert['status'] }) {
  const s = ALERT_STATUS[status];
  return (
    <Badge icon={s.icon} tone={s.tone}>
      {s.label}
    </Badge>
  );
}

const WARRANTY = {
  active: {
    label: 'Warranty active',
    icon: ShieldCheck,
    tone: 'border-green-400 bg-green-50 text-green-900',
  },
  expiring: {
    label: 'Warranty expiring',
    icon: ShieldAlert,
    tone: 'border-amber-400 bg-amber-50 text-amber-900',
  },
  expired: {
    label: 'Warranty expired',
    icon: ShieldX,
    tone: 'border-red-300 bg-red-50 text-red-900',
  },
} as const;

export function WarrantyBadge({ status }: { status: PackSummary['warrantyStatus'] }) {
  const s = WARRANTY[status];
  return (
    <Badge icon={s.icon} tone={s.tone}>
      {s.label}
    </Badge>
  );
}

const TREND = {
  declining: {
    label: 'Declining',
    icon: ArrowDownRight,
    tone: 'border-red-300 bg-red-50 text-red-900',
  },
  improving: {
    label: 'Improving',
    icon: ArrowUpRight,
    tone: 'border-green-400 bg-green-50 text-green-900',
  },
  stable: {
    label: 'Stable',
    icon: ArrowRight,
    tone: 'border-slate-300 bg-slate-100 text-slate-800',
  },
  insufficient_data: {
    label: 'Not enough data',
    icon: CircleHelp,
    tone: 'border-slate-300 bg-white text-slate-800',
  },
} as const;

/** Trend in words and an arrow, with the slope (points of SoH per 30 days) when there is one. */
export function TrendBadge({ trend }: { trend: PackSummary['trend'] }) {
  const t = TREND[trend.direction];
  // Round first, then choose the sign, so a tiny value never reads as "−0.0".
  const rounded =
    trend.pointsPer30Days === null ? null : Math.round(trend.pointsPer30Days * 10) / 10;
  const slope =
    rounded === null
      ? null
      : `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(1)} pts / 30 days`;
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Badge icon={t.icon} tone={t.tone}>
        {t.label}
      </Badge>
      {slope ? <span className="text-sm text-slate-700">{slope}</span> : null}
    </span>
  );
}

/** Delivery result in words and an icon: Delivered or Failed, with the attempt number. */
export function DeliveryBadge({ status, attempt }: { status: 'sent' | 'failed'; attempt: number }) {
  const ok = status === 'sent';
  return (
    <Badge
      icon={ok ? CheckCircle2 : XCircle}
      tone={
        ok ? 'border-green-400 bg-green-50 text-green-900' : 'border-red-300 bg-red-50 text-red-900'
      }
    >
      {`${ok ? 'Delivered' : 'Failed'}, attempt ${attempt}`}
    </Badge>
  );
}
