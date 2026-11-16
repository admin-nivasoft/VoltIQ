import { PageHeading } from '../../components/ui/PageHeading';
import { EmptyState } from '../../components/ui/states';
import { useCan } from '../../lib/auth/session';
import { ChannelsSection } from './ChannelsSection';
import { LogSection } from './LogSection';
import { PolicySection } from './PolicySection';

/** Each section is shown only to people holding its permission; the API enforces the same rules. */
export function SettingsPage() {
  const channels = useCan('channels.manage_own');
  const log = useCan('notifications.view_log');
  const policy = useCan('permissions.manage');

  return (
    <div className="space-y-10">
      <PageHeading>Settings</PageHeading>
      {channels ? <ChannelsSection /> : null}
      {log ? <LogSection /> : null}
      {policy ? <PolicySection /> : null}
      {!channels && !log && !policy ? (
        <EmptyState
          title="You don't have access to settings"
          description="Ask your administrator if you need it."
        />
      ) : null}
    </div>
  );
}
