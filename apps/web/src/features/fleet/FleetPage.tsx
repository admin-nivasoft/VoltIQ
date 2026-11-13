import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { PageHeading } from '../../components/ui/PageHeading';
import { EmptyState } from '../../components/ui/states';
import { formatTime } from '../../lib/format';
import { useCan } from '../../lib/auth/session';
import { AlertsSection } from '../alerts/AlertsSection';
import { PacksSection } from '../packs/PacksSection';
import { SummaryTiles } from './SummaryTiles';

const SECTION_KEYS = ['fleet', 'alerts', 'packs'];

/**
 * The oldest successful refresh among the sections on screen, so "Last refreshed" never claims more
 * than is true: if the pack list is older than the tiles, that older time is the one shown.
 */
function useOldestRefresh(): number {
  const qc = useQueryClient();
  const cache = qc.getQueryCache();
  return useSyncExternalStore(
    (notify) => cache.subscribe(notify),
    () => {
      const times = cache
        .findAll({ type: 'active', predicate: (q) => SECTION_KEYS.includes(String(q.queryKey[0])) })
        .map((q) => q.state.dataUpdatedAt)
        .filter((t) => t > 0);
      return times.length ? Math.min(...times) : 0;
    },
  );
}

function LastRefreshed() {
  const qc = useQueryClient();
  const oldest = useOldestRefresh();
  const refreshing =
    useIsFetching({ predicate: (q) => SECTION_KEYS.includes(String(q.queryKey[0])) }) > 0;
  return (
    <div className="flex flex-wrap items-center gap-3 text-slate-800">
      {oldest ? (
        <p>
          Last refreshed <time dateTime={new Date(oldest).toISOString()}>{formatTime(oldest)}</time>
        </p>
      ) : null}
      <button
        type="button"
        aria-disabled={refreshing}
        onClick={() => {
          if (refreshing) return;
          void Promise.all(SECTION_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] })));
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-500 bg-white px-3 font-medium text-slate-900 hover:bg-slate-100 aria-disabled:opacity-70"
      >
        <RefreshCw
          aria-hidden="true"
          className={`h-4 w-4 ${refreshing ? 'animate-spin motion-reduce:animate-none' : ''}`}
        />
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  );
}

export function FleetPage() {
  const canFleet = useCan('fleet.view');
  const canAlerts = useCan('alerts.view');
  const canPacks = useCan('packs.view');
  const canSettings = useCan('channels.manage_own', 'permissions.manage', 'notifications.view_log');

  if (!canFleet && !canAlerts && !canPacks) {
    return (
      <div className="space-y-6">
        <PageHeading>Fleet health</PageHeading>
        <EmptyState
          title="You don't have access to fleet health"
          description="Ask your administrator if you need it."
          action={
            canSettings ? (
              <Link
                to="/settings"
                className="inline-flex min-h-11 items-center font-medium text-blue-800 underline"
              >
                Go to Settings
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeading>Fleet health</PageHeading>
        <LastRefreshed />
      </div>
      {canFleet ? <SummaryTiles /> : null}
      {canAlerts ? <AlertsSection /> : null}
      {canPacks ? <PacksSection /> : null}
    </div>
  );
}
