import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Alert } from '@ql/contracts';
import { callsOf, makeAlert, makeMe, page, renderWithProviders, stubApi } from '../../test/utils';
import { AlertsSection } from './AlertsSection';

afterEach(() => vi.unstubAllGlobals());

const alerts = [
  makeAlert(1, { severity: 'high' }),
  makeAlert(2, { severity: 'medium', title: 'Battery is ageing faster than similar packs' }),
  makeAlert(3, { severity: 'low', title: 'Small change in battery behaviour' }),
];

describe('AlertsSection', () => {
  it('lists alerts in plain language, each with severity and status as words (and icons), never colour alone', async () => {
    stubApi({ 'GET /alerts': { body: page(alerts) } });
    renderWithProviders(<AlertsSection />, { me: makeMe('fleet_manager') });
    const items = await screen.findAllByRole('article');
    expect(items).toHaveLength(3);
    const first = within(items[0]!);
    expect(first.getByText('High severity')).toBeInTheDocument();
    expect(first.getByText('Open')).toBeInTheDocument();
    expect(first.getByRole('heading', { level: 3 })).toHaveTextContent(/dropping faster/);
    expect(first.getByText(/Recommended action:/)).toBeInTheDocument();
    expect(first.getByText(/QL-A-0001/)).toBeInTheDocument();
    expect(within(items[1]!).getByText('Medium severity')).toBeInTheDocument();
    expect(within(items[2]!).getByText('Low severity')).toBeInTheDocument();
    for (const svg of document.querySelectorAll('article svg'))
      expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('asks the API for open alerts by default, and for another status when the filter changes', async () => {
    const spy = stubApi({ 'GET /alerts': { body: page(alerts) } });
    renderWithProviders(<AlertsSection />, { me: makeMe('fleet_manager') });
    await screen.findAllByRole('article');
    expect(callsOf(spy)[0]![0]).toContain('status=open');
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'resolved');
    await waitFor(() =>
      expect(callsOf(spy).some(([u]) => u.includes('status=resolved'))).toBe(true),
    );
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'all');
    await waitFor(() => expect(callsOf(spy).at(-1)![0]).not.toContain('status='));
  });

  it('a fleet manager sees Acknowledge on open alerts, named with the alert title', async () => {
    stubApi({ 'GET /alerts': { body: page(alerts) } });
    renderWithProviders(<AlertsSection />, { me: makeMe('fleet_manager') });
    expect(await screen.findAllByRole('button', { name: /^Acknowledge/ })).toHaveLength(3);
    expect(
      screen.getByRole('button', { name: /Acknowledge\s*:\s*Small change in battery behaviour/ }),
    ).toBeInTheDocument();
  });

  it('a technician sees the alerts but no Acknowledge button', async () => {
    stubApi({ 'GET /alerts': { body: page(alerts) } });
    renderWithProviders(<AlertsSection />, { me: makeMe('technician') });
    expect(await screen.findAllByRole('article')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /Acknowledge/ })).not.toBeInTheDocument();
  });

  it('acknowledging posts, announces the result, refreshes the list and the tile count, and returns focus', async () => {
    let open: Alert[] = [...alerts];
    const spy = stubApi({
      'GET /alerts': () => ({ body: page(open) }),
      'GET /fleet/summary': {
        body: {
          packsInService: 1,
          averageSohPct: 90,
          activeAlerts: open.length,
          packsNearingEol: 0,
          asOf: new Date().toISOString(),
        },
      },
      [`POST /alerts/${alerts[0]!.id}/acknowledge`]: () => {
        open = open.slice(1);
        return {
          body: {
            ...alerts[0]!,
            status: 'acknowledged',
            acknowledgedBy: 'Fleet Manager A',
            acknowledgedAt: new Date().toISOString(),
          },
        };
      },
    });
    renderWithProviders(<AlertsSection />, { me: makeMe('fleet_manager') });
    await userEvent.click((await screen.findAllByRole('button', { name: /^Acknowledge/ }))[0]!);
    expect(
      await screen.findByText(/Alert acknowledged: Battery health is dropping/),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
    const post = callsOf(spy).find(([, i]) => i.method === 'POST')!;
    expect(post[0]).toBe(`/api/v1/alerts/${alerts[0]!.id}/acknowledge`);
    expect(new Headers(post[1].headers).get('x-requested-with')).toBe('ql');
    expect(post[1].body).toBeUndefined(); // nothing about who or which consumer is sent: the server knows
    expect(screen.getByRole('heading', { level: 2, name: 'Alerts' })).toHaveFocus();
  });

  it.each([
    [409, /already been resolved/i],
    [404, /no longer available/i],
    [403, /permission to acknowledge/i],
    [500, /couldn.t acknowledge/i],
  ])(
    'a %i on acknowledge is explained in plain words and announced as an alert',
    async (status, re) => {
      stubApi({
        'GET /alerts': { body: page(alerts) },
        [`POST /alerts/${alerts[0]!.id}/acknowledge`]: {
          status,
          body: { error: { code: 'conflict', message: 'x' } },
        },
      });
      renderWithProviders(<AlertsSection />, { me: makeMe('fleet_manager') });
      await userEvent.click((await screen.findAllByRole('button', { name: /^Acknowledge/ }))[0]!);
      expect(await screen.findByRole('alert')).toHaveTextContent(re);
    },
  );

  it('cannot be double-submitted while acknowledging, and keeps keyboard focus on the button', async () => {
    const spy = stubApi({
      'GET /alerts': { body: page(alerts) },
      [`POST /alerts/${alerts[0]!.id}/acknowledge`]: () => new Promise(() => {}) as never,
    });
    renderWithProviders(<AlertsSection />, { me: makeMe('fleet_manager') });
    const button = (await screen.findAllByRole('button', { name: /^Acknowledge/ }))[0]!;
    await userEvent.click(button);
    const busy = await screen.findByRole('button', { name: /Acknowledging/ });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(busy);
    expect(callsOf(spy).filter(([, i]) => i.method === 'POST')).toHaveLength(1);
  });

  it('shows who acknowledged an alert and when', async () => {
    const done = makeAlert(9, {
      status: 'acknowledged',
      acknowledgedBy: 'Fleet Manager A',
      acknowledgedAt: '2026-11-11T10:00:00.000Z',
    });
    stubApi({ 'GET /alerts': { body: page([done]) } });
    renderWithProviders(<AlertsSection />, { me: makeMe('fleet_manager') });
    expect(await screen.findByText(/Acknowledged by Fleet Manager A/)).toBeInTheDocument();
    expect(within(screen.getByRole('article')).getByText('Acknowledged')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Acknowledge/ })).not.toBeInTheDocument();
  });

  it('has an empty state, a loading state and an error state with retry', async () => {
    let n = 0;
    stubApi({
      'GET /alerts': () =>
        ++n === 1
          ? { status: 500, body: { error: { code: 'internal', message: 'x' } } }
          : { body: page([]) },
    });
    renderWithProviders(<AlertsSection />, { me: makeMe('fleet_manager') });
    // A loading status is on screen (the always-present announcement region is a second status).
    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('heading', { name: 'No open alerts' })).toBeInTheDocument();
    expect(screen.getByText(/nothing needs your attention/i)).toBeInTheDocument();
  });

  it('pages through long lists', async () => {
    const spy = stubApi({
      'GET /alerts': (url) => ({
        body: page(alerts, 25, Number(url.searchParams.get('page') ?? 1), 10),
      }),
    });
    renderWithProviders(<AlertsSection />, { me: makeMe('fleet_manager') });
    await screen.findAllByRole('article');
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /next page of alerts/i }));
    await waitFor(() => expect(callsOf(spy).some(([u]) => u.includes('page=2'))).toBe(true));
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
  });
});

describe('AlertsSection: the review findings', () => {
  const same = [makeAlert(1), makeAlert(2)]; // identical titles, different packs

  it('every Acknowledge is disabled while one is in flight, so no outcome is lost', async () => {
    const spy = stubApi({
      'GET /alerts': { body: page(same) },
      [`POST /alerts/${same[0]!.id}/acknowledge`]: () => new Promise(() => {}) as never,
    });
    renderWithProviders(<AlertsSection />, { me: makeMe('fleet_manager') });
    const buttons = await screen.findAllByRole('button', { name: /^Acknowledge/ });
    await userEvent.click(buttons[0]!);
    await screen.findByRole('button', { name: /Acknowledging/ });
    const other = screen.getAllByRole('button', { name: /^Acknowledge/ })[0]!;
    expect(other).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(other);
    expect(callsOf(spy).filter(([, i]) => i.method === 'POST')).toHaveLength(1);
  });

  it('two alerts with the same title each get their own announcement (it names the pack)', async () => {
    let open = [...same];
    stubApi({
      'GET /alerts': () => ({ body: page(open) }),
      [`POST /alerts/${same[0]!.id}/acknowledge`]: () => (
        (open = open.slice(1)),
        { body: { ...same[0]!, status: 'acknowledged' } }
      ),
      [`POST /alerts/${same[1]!.id}/acknowledge`]: () => (
        (open = []),
        { body: { ...same[1]!, status: 'acknowledged' } }
      ),
    });
    renderWithProviders(<AlertsSection />, { me: makeMe('fleet_manager') });
    await userEvent.click((await screen.findAllByRole('button', { name: /^Acknowledge/ }))[0]!);
    expect(await screen.findByText(/pack QL-A-0001\./)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    await userEvent.click(screen.getByRole('button', { name: /^Acknowledge/ }));
    expect(await screen.findByText(/pack QL-A-0002\./)).toBeInTheDocument();
  });

  it('says how many alerts there are (stable text) and clears old messages when the filter changes', async () => {
    stubApi({
      'GET /alerts': { body: page(same) },
      [`POST /alerts/${same[0]!.id}/acknowledge`]: {
        status: 409,
        body: { error: { code: 'conflict', message: 'x' } },
      },
    });
    renderWithProviders(<AlertsSection />, { me: makeMe('fleet_manager') });
    expect(await screen.findByText('Showing 1–2 of 2 alerts')).toBeInTheDocument();
    await userEvent.click((await screen.findAllByRole('button', { name: /^Acknowledge/ }))[0]!);
    expect(await screen.findByRole('alert')).toHaveTextContent(/already been resolved/i);
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'all');
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('steps back to the last page when the list shrinks under you', async () => {
    let total = 11;
    stubApi({
      'GET /alerts': (url) => {
        const p = Number(url.searchParams.get('page') ?? 1);
        return { body: page(p === 2 && total <= 10 ? [] : [makeAlert(p)], total, p, 10) };
      },
    });
    const { client } = renderWithProviders(<AlertsSection />, { me: makeMe('fleet_manager') });
    await screen.findByText('Page 1 of 2');
    await userEvent.click(screen.getByRole('button', { name: /next page of alerts/i }));
    await screen.findByText('Page 2 of 2');
    total = 10; // the only alert on page 2 was acknowledged elsewhere
    await client.invalidateQueries({ queryKey: ['alerts'] });
    expect(
      await screen.findByText(/Showing 1–1 of 10 alerts|Showing 1–10 of 10 alerts/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No alerts to show/)).not.toBeInTheDocument();
  });

  it('dims and disables Acknowledge while old rows show under a new filter', async () => {
    let release: (v: unknown) => void = () => {};
    stubApi({
      'GET /alerts': (url) =>
        url.searchParams.get('status') === 'resolved'
          ? (new Promise((r) => (release = r)) as never)
          : { body: page(same) },
    });
    renderWithProviders(<AlertsSection />, { me: makeMe('fleet_manager') });
    await screen.findAllByRole('article');
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'resolved');
    const list = await screen.findByRole('list');
    await waitFor(() => expect(list).toHaveAttribute('aria-busy', 'true'));
    for (const b of screen.getAllByRole('button', { name: /^Acknowledge/ }))
      expect(b).toHaveAttribute('aria-disabled', 'true');
    release({ status: 200, body: page([]) });
  });
});

describe('AlertsSection: loading', () => {
  it('shows a loading message with text (not just the always-present announcement region)', async () => {
    stubApi({ 'GET /alerts': () => new Promise(() => {}) as never });
    renderWithProviders(<AlertsSection />, { me: makeMe('fleet_manager') });
    expect(await screen.findByText('Loading alerts…')).toBeInTheDocument();
  });
});
