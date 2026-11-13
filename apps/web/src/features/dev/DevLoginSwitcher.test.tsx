import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callsOf, makeMe, renderWithProviders, stubFetch } from '../../test/utils';
import DevLoginSwitcher from './DevLoginSwitcher';
import { MOCK_USERS } from './mockUsers';

afterEach(() => vi.unstubAllGlobals());

describe('DevLoginSwitcher (mock mode only)', () => {
  it('is clearly marked as a development tool', () => {
    renderWithProviders(<DevLoginSwitcher />, { me: null });
    expect(screen.getByRole('region', { name: /development login/i })).toBeInTheDocument();
    expect(screen.getByText(/not for production/i)).toBeInTheDocument();
  });

  it('offers every seeded consumer and role, plus the platform admin', () => {
    renderWithProviders(<DevLoginSwitcher />, { me: null });
    expect(screen.getAllByRole('button')).toHaveLength(MOCK_USERS.length);
    for (const group of ['Consumer A', 'Consumer B', 'Consumer C', 'Platform']) {
      expect(screen.getByRole('group', { name: new RegExp(group) })).toBeInTheDocument();
    }
    const a = within(screen.getByRole('group', { name: /Consumer A/ }));
    expect(a.getByRole('button', { name: /fleet manager/i })).toBeInTheDocument();
    expect(a.getByRole('button', { name: /technician/i })).toBeInTheDocument();
    expect(a.getByRole('button', { name: /consumer admin/i })).toBeInTheDocument();
  });

  it('signing in posts only the user id, then refreshes who you are', async () => {
    const spy = stubFetch((url) =>
      url.includes('mock-login') ? { body: { ok: true } } : { body: {} },
    );
    const { client } = renderWithProviders(<DevLoginSwitcher />, { me: null });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const a = within(screen.getByRole('group', { name: /Consumer A/ }));
    await userEvent.click(a.getByRole('button', { name: /technician/i }));
    const [url, init] = callsOf(spy)[0]!;
    expect(url).toBe('/api/v1/auth/mock-login');
    expect(init.body).toBe('{"userId":"e0000001-0000-4000-8000-000000000002"}');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['me'] });
  });

  it('says so plainly when the server has mock login switched off', async () => {
    stubFetch(() => ({
      status: 404,
      body: { error: { code: 'not_found', message: 'Not found' } },
    }));
    renderWithProviders(<DevLoginSwitcher />, { me: null });
    await userEvent.click(screen.getAllByRole('button')[0]!);
    expect(await screen.findByRole('alert')).toHaveTextContent(/mock login is not available/i);
  });

  it('shows plain wording for any other failure (a 500, or no connection)', async () => {
    stubFetch(() => ({ status: 500, body: { error: { code: 'internal', message: 'x' } } }));
    renderWithProviders(<DevLoginSwitcher />, { me: null });
    await userEvent.click(screen.getAllByRole('button')[0]!);
    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
  });

  it('after signing in the user lands on the app, and keyboard focus is never dropped', async () => {
    stubFetch((url) =>
      url.includes('mock-login') ? { body: { ok: true } } : { body: makeMe('technician') },
    );
    renderWithProviders(
      <Routes>
        <Route path="/" element={<p>the app</p>} />
        <Route path="/login" element={<DevLoginSwitcher />} />
      </Routes>,
      { me: null, route: '/login' },
    );
    const button = screen.getAllByRole('button')[1]!;
    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText('the app')).toBeInTheDocument();
  });

  it('keeps focus on the pressed button while signing in (aria-disabled, not disabled)', async () => {
    stubFetch(() => new Promise(() => {}) as never);
    renderWithProviders(<DevLoginSwitcher />, { me: null });
    const button = screen.getAllByRole('button')[0]!;
    await userEvent.click(button);
    expect(await screen.findByText(/signing in/i)).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
  });
});
