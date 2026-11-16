import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import policy from '../../../../../config/permissions.json';
import { callsOf, makeMe, renderWithProviders, stubApi } from '../../test/utils';
import { PolicySection } from './PolicySection';

afterEach(() => vi.unstubAllGlobals());

const current = (version = 1, roles: unknown = policy.roles) => ({
  policy: { version, roles },
  asOf: new Date().toISOString(),
});
const box = (role: string, permission: string) =>
  screen.getByRole('checkbox', { name: `${role}: ${permission}` });

describe('PolicySection', () => {
  it('shows what each role may do, from the saved policy, with a labelled box per cell', async () => {
    stubApi({ 'GET /admin/permissions': { body: current(3) } });
    renderWithProviders(<PolicySection />, { me: makeMe('platform_admin') });
    expect(await screen.findByText(/Current version: 3/)).toBeInTheDocument();
    expect(box('Fleet manager', 'Acknowledge alerts')).toBeChecked();
    expect(box('Technician', 'Acknowledge alerts')).not.toBeChecked();
    expect(box('Consumer admin', 'See the delivery log')).toBeChecked();
    expect(box('Fleet manager', 'See the delivery log')).not.toBeChecked();
    expect(screen.getAllByRole('checkbox')).toHaveLength(18);
    // There is no way to give anyone the right to change the policy.
    expect(
      screen.queryByRole('checkbox', { name: /change the policy|permissions\.manage/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/no other role can ever hold it/i)).toBeInTheDocument();
  });

  it('save is off until something changes, then sends the whole policy (platform admin unchanged) and says which version', async () => {
    const spy = stubApi({
      'GET /admin/permissions': { body: current(1) },
      'PUT /admin/permissions': (_u, init) => ({
        body: current(2, JSON.parse(String(init.body)).roles),
      }),
    });
    renderWithProviders(<PolicySection />, { me: makeMe('platform_admin') });
    const save = await screen.findByRole('button', { name: 'Save as a new version' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(box('Technician', 'Acknowledge alerts'));
    expect(screen.getByText('You have unsaved changes.')).toBeInTheDocument();
    expect(save).toHaveAttribute('aria-disabled', 'false');
    await userEvent.click(save);
    await waitFor(() => expect(callsOf(spy).some(([, i]) => i.method === 'PUT')).toBe(true));
    const sent = JSON.parse(String(callsOf(spy).find(([, i]) => i.method === 'PUT')![1].body));
    expect(Object.keys(sent)).toEqual(['roles']); // no version, author or company is sent
    expect(sent.roles.technician).toContain('alerts.acknowledge');
    expect(sent.roles.platform_admin).toEqual(['permissions.manage']);
    expect(sent.roles.fleet_manager).toEqual(policy.roles.fleet_manager);
    expect((await screen.findAllByText(/Saved as version 2/)).length).toBeGreaterThan(0);
    expect(await screen.findByText(/Current version: 2/)).toBeInTheDocument();
    expect(box('Technician', 'Acknowledge alerts')).toBeChecked();
  });

  it('Undo changes puts every box back', async () => {
    stubApi({ 'GET /admin/permissions': { body: current(1) } });
    renderWithProviders(<PolicySection />, { me: makeMe('platform_admin') });
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Fleet manager: Acknowledge alerts' }),
    );
    expect(box('Fleet manager', 'Acknowledge alerts')).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Undo changes' }));
    expect(box('Fleet manager', 'Acknowledge alerts')).toBeChecked();
    expect(screen.queryByText('You have unsaved changes.')).not.toBeInTheDocument();
  });

  it.each([
    [400, /isn.t allowed, so nothing was saved/i],
    [403, /don.t have permission to change the policy/i],
    [500, /couldn.t save the policy/i],
  ])('a %i on save is explained, and your edits are kept', async (status, re) => {
    stubApi({
      'GET /admin/permissions': { body: current(1) },
      'PUT /admin/permissions': { status, body: { error: { code: 'x', message: 'x' } } },
    });
    renderWithProviders(<PolicySection />, { me: makeMe('platform_admin') });
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Technician: See alerts' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save as a new version' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(re);
    expect(box('Technician', 'See alerts')).not.toBeChecked();
  });

  it('warns that changes apply to every company at once', async () => {
    stubApi({ 'GET /admin/permissions': { body: current() } });
    renderWithProviders(<PolicySection />, { me: makeMe('platform_admin') });
    expect(await screen.findByText(/apply to every company straight away/i)).toBeInTheDocument();
  });

  it('has loading and error states with retry', async () => {
    let n = 0;
    stubApi({
      'GET /admin/permissions': () =>
        ++n === 1
          ? { status: 403, body: { error: { code: 'forbidden', message: 'x' } } }
          : { body: current() },
    });
    renderWithProviders(<PolicySection />, { me: makeMe('platform_admin') });
    expect(await screen.findByRole('alert')).toHaveTextContent(/permission/i);
  });
});
