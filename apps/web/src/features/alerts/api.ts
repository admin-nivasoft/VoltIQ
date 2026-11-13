import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertPageSchema, AlertSchema, type Alert } from '@ql/contracts';
import { apiFetch } from '../../lib/api/client';
import { qs } from '../../lib/api/query';
import { summaryKey } from '../fleet/api';

export type StatusFilter = Alert['status'] | 'all';
export interface AlertParams {
  status: StatusFilter;
  page: number;
  pageSize: number;
}

export function useAlerts(p: AlertParams, enabled = true) {
  return useQuery({
    queryKey: ['alerts', p],
    queryFn: () =>
      apiFetch(
        `/alerts${qs({ status: p.status === 'all' ? undefined : p.status, page: p.page, pageSize: p.pageSize, sort: 'severity:asc' })}`,
        {
          schema: AlertPageSchema,
        },
      ),
    placeholderData: keepPreviousData, // no layout jump while paging or filtering
    enabled,
  });
}

export function useAcknowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/alerts/${encodeURIComponent(id)}/acknowledge`, {
        method: 'POST',
        schema: AlertSchema,
      }),
    // Success or not, the server is the truth: refetch the list and the headline count.
    onSettled: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['alerts'] }),
        qc.invalidateQueries({ queryKey: summaryKey }),
      ]);
    },
  });
}
