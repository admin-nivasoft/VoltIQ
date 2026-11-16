import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  NotificationChannelSchema,
  NotificationLogPageSchema,
  NotificationTestResultSchema,
  RolePolicyResponseSchema,
  type ChannelType,
  type RolePolicyUpdate,
} from '@ql/contracts';
import { apiFetch } from '../../lib/api/client';
import { qs } from '../../lib/api/query';
import { z } from '@ql/contracts';

export const channelsKey = ['settings', 'channels'] as const;
export const policyKey = ['settings', 'policy'] as const;

// Forms do not poll: a refresh under someone's typing would be worse than slightly old data.
export function useChannels() {
  return useQuery({
    queryKey: channelsKey,
    queryFn: () =>
      apiFetch('/notification-channels', { schema: z.array(NotificationChannelSchema) }),
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });
}

export interface ChannelInput {
  type: ChannelType;
  target: string;
  enabled: boolean;
}

export function useSaveChannels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channels: ChannelInput[]) =>
      apiFetch('/notification-channels', {
        method: 'PUT',
        body: { channels },
        schema: z.array(NotificationChannelSchema),
      }),
    onSuccess: (saved) => qc.setQueryData(channelsKey, saved),
  });
}

export function useTestChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (type: ChannelType) =>
      apiFetch('/notification-channels/test', {
        method: 'POST',
        body: { type },
        schema: NotificationTestResultSchema,
      }),
    // A test is a log entry too.
    onSettled: () => qc.invalidateQueries({ queryKey: ['settings', 'log'] }),
  });
}

export function useNotificationLog(page: number, pageSize: number, enabled = true) {
  return useQuery({
    queryKey: ['settings', 'log', page, pageSize],
    queryFn: () =>
      apiFetch(`/notification-log${qs({ page, pageSize })}`, { schema: NotificationLogPageSchema }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function usePolicy() {
  return useQuery({
    queryKey: policyKey,
    queryFn: () => apiFetch('/admin/permissions', { schema: RolePolicyResponseSchema }),
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });
}

export function useSavePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roles: RolePolicyUpdate['roles']) =>
      apiFetch('/admin/permissions', {
        method: 'PUT',
        body: { roles },
        schema: RolePolicyResponseSchema,
      }),
    onSuccess: (saved) => qc.setQueryData(policyKey, saved),
  });
}
