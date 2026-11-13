import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '../../lib/api/client';

/** Plain-language wording for a failure. Never the server's text, never a stack or a query. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0)
      return "We can't reach the server. Check your connection and try again.";
    if (error.status === 401) return 'Your session has ended. Please sign in again.';
    if (error.status === 403) return "You don't have permission to see this.";
    if (error.status === 404) return "We couldn't find that.";
    if (error.status === 429) return 'Too many requests. Please wait a moment and try again.';
  }
  return 'Something went wrong on our side. Please try again.';
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  // The live region is on the page first and its text arrives a moment later, so screen readers announce it.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 0);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-3 p-8 text-slate-700"
    >
      <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin motion-reduce:animate-none" />
      <span>{shown ? `${label}…` : ''}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  headingLevel = 2,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  headingLevel?: 1 | 2 | 3;
}) {
  const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3';
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <Inbox aria-hidden="true" className="h-8 w-8 text-slate-600" />
      <Heading className="text-lg font-semibold text-slate-900">{title}</Heading>
      {description ? <p className="max-w-prose text-slate-700">{description}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  retrying = false,
}: {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-red-300 bg-red-50 p-8 text-center"
    >
      <AlertTriangle aria-hidden="true" className="h-8 w-8 text-red-800" />
      <p className="max-w-prose font-medium text-red-900">{describeError(error)}</p>
      {onRetry ? (
        <button
          type="button"
          aria-disabled={retrying}
          onClick={() => {
            if (!retrying) onRetry();
          }}
          className="min-h-11 rounded-md bg-red-800 px-4 font-medium text-white hover:bg-red-900"
        >
          {retrying ? 'Trying again…' : 'Try again'}
        </button>
      ) : null}
    </div>
  );
}
