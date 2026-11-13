import { Link } from 'react-router-dom';
import { PageHeading } from '../../components/ui/PageHeading';
import { EmptyState } from '../../components/ui/states';
import { useCan } from '../../lib/auth/session';

export function FleetPage() {
  const canFleet = useCan('fleet.view');
  const canSettings = useCan('channels.manage_own', 'permissions.manage', 'notifications.view_log');
  return (
    <div className="space-y-6">
      <PageHeading>Fleet health</PageHeading>
      {canFleet ? (
        <EmptyState
          title="Your fleet overview is on its way"
          description="The headline tiles, alerts and pack table arrive in the next build step."
        />
      ) : (
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
      )}
    </div>
  );
}
