import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeMe, renderWithProviders, stubFetch, testClient } from '../test/utils';
import { AppRoutes } from './App';

afterEach(() => vi.unstubAllGlobals());

describe('routing and the signed-in gate', () => {
  it('signed out: every page redirects to the sign-in page', async () => {
    renderWithProviders(<AppRoutes />, { me: null, route: '/' });
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Fleet health' })).not.toBeInTheDocument();
  });

  it('signed out on /settings also lands on sign-in', async () => {
    renderWithProviders(<AppRoutes />, { me: null, route: '/settings' });
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
  });

  it('signed in: the fleet health page is the home page', async () => {
    renderWithProviders(<AppRoutes />, { me: makeMe('fleet_manager') });
    expect(
      await screen.findByRole('heading', { level: 1, name: /fleet health/i }),
    ).toBeInTheDocument();
  });

  it('signed in: a visit to /login goes back to the app', async () => {
    renderWithProviders(<AppRoutes />, { me: makeMe('technician'), route: '/login' });
    expect(
      await screen.findByRole('heading', { level: 1, name: /fleet health/i }),
    ).toBeInTheDocument();
  });

  it('Settings opens for a user who holds a settings permission', async () => {
    renderWithProviders(<AppRoutes />, { me: makeMe('technician'), route: '/settings' });
    expect(await screen.findByRole('heading', { level: 1, name: /settings/i })).toBeInTheDocument();
  });

  it('a user with no fleet permission sees a plain no-access state, not a broken page', async () => {
    const me = makeMe('fleet_manager');
    me.permissions = ['channels.manage_own'];
    renderWithProviders(<AppRoutes />, { me, route: '/' });
    expect(await screen.findByText(/don.t have access/i)).toBeInTheDocument();
  });

  it('a user with no settings permission cannot open Settings', async () => {
    const me = makeMe('fleet_manager');
    me.permissions = ['fleet.view'];
    renderWithProviders(<AppRoutes />, { me, route: '/settings' });
    expect(await screen.findByText(/don.t have access/i)).toBeInTheDocument();
  });

  it('shows a loading state while the user is being fetched', async () => {
    stubFetch(() => new Promise(() => {}) as never);
    renderWithProviders(<AppRoutes />, { client: testClient(), route: '/' });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/loading/i));
  });

  it('shows an error state with retry when /me fails, instead of the sign-in page', async () => {
    let calls = 0;
    stubFetch(() =>
      ++calls === 1
        ? { status: 500, body: { error: { code: 'internal', message: 'x' } } }
        : { body: makeMe('fleet_manager') },
    );
    renderWithProviders(<AppRoutes />, { client: testClient(), route: '/' });
    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(
      await screen.findByRole('heading', { level: 1, name: /fleet health/i }),
    ).toBeInTheDocument();
  });

  it('an unknown address shows a not-found page with a way back', async () => {
    renderWithProviders(<AppRoutes />, { me: makeMe('fleet_manager'), route: '/nope' });
    expect(await screen.findByRole('heading', { name: /page not found/i })).toBeInTheDocument();
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: /fleet health/i }),
    ).toBeInTheDocument();
  });
});
