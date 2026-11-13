import { formatTime } from '../../lib/format';

/** Shown when a refresh failed but older data is still on screen, so numbers are never silently stale. */
export function StaleNotice({
  isError,
  updatedAt,
  noun,
}: {
  isError: boolean;
  updatedAt: number;
  noun: string;
}) {
  return (
    <p
      role="status"
      className={
        isError ? 'rounded-md border border-amber-400 bg-amber-50 p-3 text-amber-900' : 'sr-only'
      }
    >
      {isError
        ? `We couldn't refresh the ${noun}. Showing what we had at ${formatTime(updatedAt)}.`
        : ''}
    </p>
  );
}
