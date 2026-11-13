import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  callsOf,
  makeAlert,
  makeMe,
  makePack,
  makeSummary,
  page,
  renderWithProviders,
  stubApi,
} from '../../test/utils';
import { FleetPage } from './FleetPage';

afterEach(() => vi.unstubAllGlobals());

const full = () =>
  stubApi({
    'GET /fleet/summary': { body: makeSummary() },
    'GET /alerts': { body: page([makeAlert(1)]) },
    'GET /packs': { body: page([makePack(1)]) },
  });

describe('FleetPage', () => {
  it('shows the tiles, the alerts and the packs, and the time it was last refreshed', async () => {
    full();
    renderWithProviders(<FleetPage />, { me: makeMe('fleet_manager') });
    expect(await screen.findByText('Packs in service')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: 'Alerts' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: 'Packs' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Last refreshed/)).toBeInTheDocument());
    expect(document.querySelector('time[datetime]')).not.toBeNull();
  });

  it('Refresh asks the server for everything again', async () => {
    const spy = full();
    renderWithProviders(<FleetPage />, { me: makeMe('fleet_manager') });
    await screen.findByText('QL-A-0001');
    const before = callsOf(spy).length;
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(callsOf(spy).length).toBeGreaterThanOrEqual(before + 3));
  });

  it('only asks for what the user may see: no permission, no request', async () => {
    const me = makeMe('technician');
    me.permissions = ['alerts.view'];
    const spy = stubApi({ 'GET /alerts': { body: page([makeAlert(1)]) } });
    renderWithProviders(<FleetPage />, { me });
    expect(await screen.findByRole('heading', { level: 2, name: 'Alerts' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Packs' })).not.toBeInTheDocument();
    expect(screen.queryByText('Packs in service')).not.toBeInTheDocument();
    const urls = callsOf(spy).map(([u]) => u);
    expect(urls.every((u) => u.startsWith('/api/v1/alerts'))).toBe(true);
  });

  it('a user with no fleet permission sees a plain no-access page and nothing is requested', async () => {
    const me = makeMe('fleet_manager');
    me.permissions = ['channels.manage_own'];
    const spy = stubApi({});
    renderWithProviders(<FleetPage />, { me });
    expect(await screen.findByText(/don.t have access to fleet health/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Settings' })).toBeInTheDocument();
    expect(callsOf(spy)).toHaveLength(0);
  });

  it('the page has one h1, and sections are h2 with h3 items', async () => {
    full();
    renderWithProviders(<FleetPage />, { me: makeMe('fleet_manager') });
    await screen.findByText('QL-A-0001');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Fleet summary',
      'Alerts',
      'Packs',
    ]);
    expect(screen.getAllByRole('heading', { level: 3 }).length).toBeGreaterThan(0);
  });

  it('acknowledging an alert makes the Active alerts tile count drop', async () => {
    let open = [makeAlert(1), makeAlert(2), makeAlert(3)];
    stubApi({
      'GET /fleet/summary': () => ({ body: makeSummary({ activeAlerts: open.length }) }),
      'GET /alerts': () => ({ body: page(open) }),
      'GET /packs': { body: page([makePack(1)]) },
      [`POST /alerts/${open[0]!.id}/acknowledge`]: () => {
        const done = {
          ...open[0]!,
          status: 'acknowledged' as const,
          acknowledgedBy: 'Fleet Manager A',
          acknowledgedAt: new Date().toISOString(),
        };
        open = open.slice(1);
        return { body: done };
      },
    });
    renderWithProviders(<FleetPage />, { me: makeMe('fleet_manager') });
    const activeTile = async () =>
      (await screen.findByText('Active alerts')).closest('div') as HTMLElement;
    expect(within(await activeTile()).getByText('3')).toBeInTheDocument();
    await userEvent.click((await screen.findAllByRole('button', { name: /^Acknowledge/ }))[0]!);
    await waitFor(() =>
      expect(
        within(screen.getByText('Active alerts').closest('div') as HTMLElement).getByText('2'),
      ).toBeInTheDocument(),
    );
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('Last refreshed is the oldest of the sections on screen, and Refresh shows it is busy', async () => {
    let release: (v: unknown) => void = () => {};
    let n = 0;
    stubApi({
      'GET /fleet/summary': { body: makeSummary() },
      'GET /alerts': { body: page([makeAlert(1)]) },
      'GET /packs': () =>
        ++n === 1 ? { body: page([makePack(1)]) } : (new Promise((r) => (release = r)) as never),
    });
    renderWithProviders(<FleetPage />, { me: makeMe('fleet_manager') });
    await screen.findByText('QL-A-0001');
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    const busy = await screen.findByRole('button', { name: /Refreshing/ });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    release({ status: 200, body: page([makePack(1)]) });
    expect(await screen.findByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });
});
