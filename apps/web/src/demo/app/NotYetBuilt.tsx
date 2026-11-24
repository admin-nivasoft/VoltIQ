import { Construction } from 'lucide-react';
import { Link } from 'react-router-dom';
import { InlineNotification } from '../../components/ui/inline-notification';
import { usePageTitle } from '../../lib/usePageTitle';

/** Placeholder for a screen that is not built yet. It still has a way back. */
export function NotYetBuilt({ title }: { title: string }) {
  usePageTitle(title);
  return (
    <div className="mx-auto max-w-[1312px] px-4 pt-6 lg:px-8">
      <h1 className="text-[28px] leading-9">{title}</h1>
      <InlineNotification kind="info" title="Not in this preview yet" className="mt-6">
        <p className="flex items-center gap-2">
          <Construction aria-hidden="true" className="h-4 w-4" />
          This screen is being built.
        </p>
      </InlineNotification>
      <Link to="/" className="mt-6 inline-block text-cds-interactive hover:underline">
        Back to the fleet overview
      </Link>
    </div>
  );
}
