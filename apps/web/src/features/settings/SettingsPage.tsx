import { PageHeading } from '../../components/ui/PageHeading';
import { EmptyState } from '../../components/ui/states';
import { useCan } from '../../lib/auth/session';

export function SettingsPage() {
  const allowed = useCan('channels.manage_own', 'permissions.manage', 'notifications.view_log');
  return (
    <div className="space-y-6">
      <PageHeading>Settings</PageHeading>
      {allowed ? (
        <EmptyState
          title="Settings are on their way"
          description="Notification channels, the delivery log and role policy arrive in a later build step."
        />
      ) : (
        <EmptyState
          title="You don't have access to settings"
          description="Ask your administrator if you need it."
        />
      )}
    </div>
  );
}
