import { useQuery } from '@tanstack/react-query';
import { FleetSummarySchema } from '@ql/contracts';
import { apiFetch } from '../../lib/api/client';

export const summaryKey = ['fleet', 'summary'] as const;

export function useFleetSummary(enabled = true) {
  return useQuery({
    queryKey: summaryKey,
    queryFn: () => apiFetch('/fleet/summary', { schema: FleetSummarySchema }),
    enabled,
  });
}
