import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import policy from '../../../../../config/permissions.json';
import { makeMe, page, renderWithProviders, stubApi } from '../../test/utils';
import { SettingsPage } from './SettingsPage';

afterEach(() => vi.unstubAllGlobals());

const api = () =>
  stubApi({
    'GET /notification-channels': { body: [] },
    'GET /notification-log': { body: page([]) },
    'GET /admin/permissions': {
      body: { policy: { version: 1, roles: policy.roles }, asOf: new Date().toISOString() },
    },
  });
const has = (name: RegExp) => screen.queryByRole('heading', { level: 2, name });

describe('SettingsPage shows each section only to people who hold its permission', () => {
  it.each([
    ['fleet_manager', true, false, false],
    ['technician', true, false, false],
    ['consumer_admin', true, true, false],
    ['platform_admin', false, false, true],
  ] as const)('%s', async (role, channels, log, policySection) => {
    api();
    renderWithProviders(<SettingsPage />, { me: makeMe(role) });
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    await screen.findAllByRole('heading', { level: 2 });
    expect(!!has(/My notification channels/)).toBe(channels);
    expect(!!has(/Delivery log/)).toBe(log);
    expect(!!has(/Role policy/)).toBe(policySection);
  });

  it('nobody sees the policy editor from the consumer roles, and nothing is requested for hidden sections', async () => {
    const spy = api();
    renderWithProviders(<SettingsPage />, { me: makeMe('consumer_admin') });
    await screen.findByRole('heading', { level: 2, name: /Delivery log/ });
    const urls = spy.mock.calls.map(([u]) => String(u));
    expect(urls.some((u) => u.includes('/admin/permissions'))).toBe(false);
  });

  it('someone with no settings permission gets a plain no-access page', () => {
    const me = makeMe('fleet_manager');
    me.permissions = ['fleet.view'];
    renderWithProviders(<SettingsPage />, { me });
    expect(screen.getByText(/don.t have access to settings/i)).toBeInTheDocument();
  });
});
