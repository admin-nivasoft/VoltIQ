import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { PackPageSchema } from '@ql/contracts';
import { apiFetch } from '../../lib/api/client';
import { qs } from '../../lib/api/query';

export type SortField = 'serial' | 'sohPct' | 'trend' | 'remainingLife' | 'warrantyStatus';
export interface PackParams {
  q: string;
  sort: `${SortField}:${'asc' | 'desc'}`;
  page: number;
  pageSize: number;
}

export function usePacks(p: PackParams, enabled = true) {
  return useQuery({
    queryKey: ['packs', p],
    queryFn: () =>
      apiFetch(`/packs${qs({ q: p.q.trim(), sort: p.sort, page: p.page, pageSize: p.pageSize })}`, {
        schema: PackPageSchema,
      }),
    placeholderData: keepPreviousData,
    enabled,
  });
}
