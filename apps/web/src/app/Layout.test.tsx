import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callsOf, makeMe, renderWithProviders, stubFetch } from '../test/utils';
import { Layout } from './Layout';

afterEach(() => vi.unstubAllGlobals());

const shell = (
  <Routes>
    <Route element={<Layout />}>
      <Route path="/" element={<p>page body</p>} />
      <Route path="/login" element={<p>login page</p>} />
    </Route>
  </Routes>
);

describe('Layout: the branded top bar', () => {
  it('shows the consumer, the supplier line, the logo, the user and a skip link', () => {
    renderWithProviders(shell, { me: makeMe('fleet_manager') });
    const header = screen.getByRole('banner');
    expect(within(header).getByText('82V QualityLoop · Fleet Health')).toBeInTheDocument();
    expect(within(header).getByText('Aurora Motors (OEM)')).toBeInTheDocument();
    expect(within(header).getByText('Packs supplied by 82 Volts')).toBeInTheDocument();
    expect(within(header).getByRole('img', { name: /82 Volts/ })).toHaveAttribute(
      'src',
      '/assets/82volts-logo.svg',
    );
    expect(within(header).getByText(/Fleet Manager A/)).toBeInTheDocument();
    expect(within(header).getByText(/Fleet manager/)).toBeInTheDocument();
    const skip = screen.getByRole('link', { name: /skip to main content/i });
    expect(skip).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
    expect(screen.getByText('page body')).toBeInTheDocument();
  });

  it('shows Fleet health and Settings in a labelled navigation', () => {
    renderWithProviders(shell, { me: makeMe('fleet_manager') });
    const nav = screen.getByRole('navigation', { name: /main/i });
    expect(within(nav).getByRole('link', { name: 'Fleet health' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('a technician can still reach Settings (channels), decided by permission', () => {
    renderWithProviders(shell, { me: makeMe('technician') });
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  it('the platform admin has no consumer, no fleet link and a clear label', () => {
    renderWithProviders(shell, { me: makeMe('platform_admin') });
    expect(screen.getByText('Platform administration')).toBeInTheDocument();
    expect(screen.queryByText(/Packs supplied by/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Fleet health' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  it('without the manufacturer logo it still shows the supplier line and no broken image', () => {
    const me = makeMe('fleet_manager');
    me.manufacturer = { name: '82 Volts', logoUrl: null };
    renderWithProviders(shell, { me });
    expect(screen.getByText('Packs supplied by 82 Volts')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('Sign out calls the API, clears the user and goes to the login page', async () => {
    const spy = stubFetch(() => ({ status: 204 }));
    const { client } = renderWithProviders(shell, { me: makeMe('fleet_manager') });
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(callsOf(spy)[0]![0]).toBe('/api/v1/auth/logout');
    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(client.getQueryData(['me'])).toBeNull();
  });

  it('keeps every interactive control at least 44 px tall (touch targets)', () => {
    renderWithProviders(shell, { me: makeMe('fleet_manager') });
    for (const el of [
      ...screen.getAllByRole('link'),
      screen.getByRole('button', { name: /sign out/i }),
    ]) {
      expect(el.className, el.textContent ?? '').toMatch(/min-h-11/);
    }
  });
});
