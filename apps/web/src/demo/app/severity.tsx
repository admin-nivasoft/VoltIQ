import { CircleAlert, OctagonAlert, TriangleAlert } from 'lucide-react';
import { Tag } from '../../components/ui/tag';
import type { Severity } from '../types';

export const SEVERITY: Record<Severity, { label: string; icon: typeof OctagonAlert; tone: 'high' | 'medium' | 'low' }> = {
  high: { label: 'High', icon: OctagonAlert, tone: 'high' },
  medium: { label: 'Medium', icon: TriangleAlert, tone: 'medium' },
  low: { label: 'Low', icon: CircleAlert, tone: 'low' },
};

/** Severity is always text and an icon; the colour only reinforces it. */
export function SeverityTag({ severity }: { severity: Severity }) {
  const s = SEVERITY[severity];
  const Icon = s.icon;
  return (
    <Tag tone={s.tone}>
      <Icon aria-hidden="true" />
      {s.label}
    </Tag>
  );
}
