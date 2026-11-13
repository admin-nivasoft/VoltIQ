import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api/client';
import { describeError, EmptyState, ErrorState, LoadingState } from './states';

describe('LoadingState', () => {
  it('is a polite live region that exists first and gets its text a moment later (so it is announced)', async () => {
    render(<LoadingState label="Loading alerts" />);
    const s = screen.getByRole('status');
    expect(s).toHaveAttribute('aria-live', 'polite');
    await waitFor(() => expect(s).toHaveTextContent('Loading alerts'));
  });
  it('has a default label', async () => {
    render(<LoadingState />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Loading'));
  });
});

describe('EmptyState', () => {
  it('shows a title, a description and an optional action', () => {
    render(
      <EmptyState
        title="No alerts"
        description="Nothing needs attention."
        action={<button type="button">Refresh</button>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'No alerts' })).toBeInTheDocument();
    expect(screen.getByText('Nothing needs attention.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('is an alert with plain wording and a retry button that retries', async () => {
    const retry = vi.fn();
    render(
      <ErrorState
        error={new ApiError(500, 'internal', 'boom: SELECT * FROM packs')}
        onRetry={retry}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/something went wrong/i);
    expect(alert).not.toHaveTextContent(/SELECT|boom/);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('has no retry button when there is nothing to retry', () => {
    render(<ErrorState error={new ApiError(403, 'forbidden', 'x')} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([
    [0, /can.t reach/i],
    [401, /sign in/i],
    [403, /permission/i],
    [404, /couldn.t find/i],
    [429, /too many/i],
    [502, /something went wrong/i],
  ])('describes status %i in plain language', (status, re) => {
    expect(describeError(new ApiError(status, 'x', 'server detail'))).toMatch(re);
  });

  it('describes a non-API error generically and never leaks its message', () => {
    expect(describeError(new Error('secret stack info'))).toMatch(/something went wrong/i);
    expect(describeError('x')).toMatch(/something went wrong/i);
  });
});
