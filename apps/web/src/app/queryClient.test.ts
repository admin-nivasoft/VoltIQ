import { describe, expect, it } from 'vitest';
import { ApiError } from '../lib/api/client';
import { createQueryClient, POLL_INTERVAL_MS } from './queryClient';

describe('query client', () => {
  const opts = createQueryClient().getDefaultOptions().queries!;

  it('polls every 30 seconds, but not while the tab is hidden', () => {
    expect(POLL_INTERVAL_MS).toBe(30_000);
    expect(opts.refetchInterval).toBe(30_000);
    expect(opts.refetchIntervalInBackground).toBe(false);
  });

  it('does not retry client errors, and retries server and network errors twice', () => {
    const retry = opts.retry as (n: number, e: unknown) => boolean;
    for (const status of [400, 401, 403, 404, 409, 429])
      expect(retry(0, new ApiError(status, 'x', 'x'))).toBe(false);
    expect(retry(0, new ApiError(500, 'internal', 'x'))).toBe(true);
    expect(retry(1, new ApiError(0, 'network', 'x'))).toBe(true);
    expect(retry(2, new ApiError(500, 'internal', 'x'))).toBe(false);
  });
});
