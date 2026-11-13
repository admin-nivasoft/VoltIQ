import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  callsOf,
  makeMe,
  makePack,
  page,
  renderWithProviders,
  setViewport,
  stubApi,
} from '../../test/utils';
import { PacksSection } from './PacksSection';

afterEach(() => vi.unstubAllGlobals());

const packs = [
  makePack(1, {
    trend: { direction: 'declining', pointsPer30Days: -1.6 },
    warrantyStatus: 'expiring',
    remainingLife: { monthsLow: 2, monthsHigh: 5, confidence: 0.74 },
  }),
  makePack(2, {
    trend: { direction: 'improving', pointsPer30Days: 0.8 },
    warrantyStatus: 'expired',
  }),
  makePack(3, {
    trend: { direction: 'insufficient_data', pointsPer30Days: null },
    remainingLife: null,
    assetId: null,
    status: 'out_of_service',
    sohPct: null,
  }),
];

describe('PacksSection on a wide screen: the table', () => {
  it('has the five columns the requirement lists, with proper header cells', async () => {
    stubApi({ 'GET /packs': { body: page(packs) } });
    renderWithProviders(<PacksSection />, { me: makeMe() });
    const table = await screen.findByRole('table');
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual([
      'Serial',
      'Asset',
      'State of health and trend',
      'Remaining life',
      'Warranty',
    ]);
    for (const h of within(table).getAllByRole('columnheader'))
      expect(h).toHaveAttribute('scope', 'col');
    expect(within(table).getAllByRole('rowheader')).toHaveLength(3);
    expect(within(table).getByRole('rowheader', { name: /QL-A-0001/ })).toBeInTheDocument();
    expect(table.querySelector('caption')).not.toBeNull();
  });

  it('shows trend as words and an arrow, never colour alone, with the slope', async () => {
    stubApi({ 'GET /packs': { body: page(packs) } });
    renderWithProviders(<PacksSection />, { me: makeMe() });
    const rows = await screen.findAllByRole('row');
    expect(within(rows[1]!).getByText('Declining')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('−1.6 pts / 30 days')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Improving')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('+0.8 pts / 30 days')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('Not enough data')).toBeInTheDocument();
    for (const svg of document.querySelectorAll('table svg'))
      expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows remaining life as a range with its confidence, and says so when there is none', async () => {
    stubApi({ 'GET /packs': { body: page(packs) } });
    renderWithProviders(<PacksSection />, { me: makeMe() });
    const rows = await screen.findAllByRole('row');
    expect(within(rows[1]!).getByText('2–5 months')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('74% confidence')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('8–12 months')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('Not available')).toBeInTheDocument();
  });

  it('shows warranty status as words, the asset id (or that it is unassigned) and a non-service state', async () => {
    stubApi({ 'GET /packs': { body: page(packs) } });
    renderWithProviders(<PacksSection />, { me: makeMe() });
    const rows = await screen.findAllByRole('row');
    expect(within(rows[1]!).getByText('Warranty expiring')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Warranty expired')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('ASSET-A-001')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('Not assigned')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('Out of service')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('—')).toBeInTheDocument(); // no SoH reading
  });

  it('sorts from the column buttons, exposes aria-sort, and toggles direction', async () => {
    const spy = stubApi({ 'GET /packs': { body: page(packs) } });
    renderWithProviders(<PacksSection />, { me: makeMe() });
    const serial = await screen.findByRole('columnheader', { name: /Serial/ });
    expect(serial).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: /State of health/ })).toHaveAttribute(
      'aria-sort',
      'none',
    );
    await userEvent.click(
      within(screen.getByRole('columnheader', { name: /State of health/ })).getByRole('button'),
    );
    await waitFor(() =>
      expect(callsOf(spy).some(([u]) => u.includes('sort=sohPct%3Aasc'))).toBe(true),
    );
    expect(screen.getByRole('columnheader', { name: /State of health/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await userEvent.click(
      within(screen.getByRole('columnheader', { name: /State of health/ })).getByRole('button'),
    );
    await waitFor(() =>
      expect(callsOf(spy).some(([u]) => u.includes('sort=sohPct%3Adesc'))).toBe(true),
    );
    expect(screen.getByRole('columnheader', { name: /State of health/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    expect(screen.getByRole('columnheader', { name: /Serial/ })).toHaveAttribute(
      'aria-sort',
      'none',
    );
  });

  it('every sortable header is a real button reachable by keyboard', async () => {
    const spy = stubApi({ 'GET /packs': { body: page(packs) } });
    renderWithProviders(<PacksSection />, { me: makeMe() });
    const btn = within(await screen.findByRole('columnheader', { name: /Warranty/ })).getByRole(
      'button',
    );
    btn.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(callsOf(spy).some(([u]) => u.includes('warrantyStatus%3Aasc'))).toBe(true),
    );
  });

  it('searches after a short pause, sends the term encoded, and goes back to page 1', async () => {
    const spy = stubApi({ 'GET /packs': { body: page(packs) } });
    renderWithProviders(<PacksSection />, { me: makeMe() });
    await screen.findByRole('table');
    await userEvent.type(screen.getByLabelText('Search packs'), 'QL & 100%');
    await waitFor(() =>
      expect(callsOf(spy).some(([u]) => u.includes('q=QL+%26+100%25'))).toBe(true),
    );
    expect(callsOf(spy).every(([u]) => !u.includes('QL & 100%'))).toBe(true);
  });

  it('says what it found, and offers to clear a search that matches nothing', async () => {
    stubApi({
      'GET /packs': (url) => ({ body: url.searchParams.get('q') ? page([]) : page(packs, 3) }),
    });
    renderWithProviders(<PacksSection />, { me: makeMe() });
    expect(
      await screen.findByText('Showing 1–3 of 3 packs, sorted by serial (a to z)'),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search packs'), 'zzz');
    expect(
      await screen.findByRole('heading', { name: /No packs match “zzz”/ }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByLabelText('Search packs')).toHaveValue('');
  });

  it('has loading, error-with-retry and empty states', async () => {
    let n = 0;
    stubApi({
      'GET /packs': () =>
        ++n === 1
          ? { status: 500, body: { error: { code: 'internal', message: 'x' } } }
          : { body: page([]) },
    });
    renderWithProviders(<PacksSection />, { me: makeMe() });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('heading', { name: 'No packs yet' })).toBeInTheDocument();
  });

  it('pages 25 at a time', async () => {
    const spy = stubApi({
      'GET /packs': (url) => ({ body: page(packs, 40, Number(url.searchParams.get('page') ?? 1)) }),
    });
    renderWithProviders(<PacksSection />, { me: makeMe() });
    expect(
      await screen.findByText('Showing 1–25 of 40 packs, sorted by serial (a to z)'),
    ).toBeInTheDocument();
    expect(callsOf(spy)[0]![0]).toContain('pageSize=25');
    await userEvent.click(screen.getByRole('button', { name: /next page of packs/i }));
    expect(
      await screen.findByText('Showing 26–40 of 40 packs, sorted by serial (a to z)'),
    ).toBeInTheDocument();
  });
});

describe('PacksSection on a phone: cards instead of a table (D-14)', () => {
  it('shows the same data as cards, with no table', async () => {
    setViewport('phone');
    stubApi({ 'GET /packs': { body: page(packs) } });
    renderWithProviders(<PacksSection />, { me: makeMe() });
    expect(await screen.findAllByRole('article')).toHaveLength(3);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const first = within(screen.getByRole('article', { name: 'Pack QL-A-0001' }));
    expect(first.getByText('Declining')).toBeInTheDocument();
    expect(first.getByText('−1.6 pts / 30 days')).toBeInTheDocument();
    expect(first.getByText('2–5 months')).toBeInTheDocument();
    expect(first.getByText('74% confidence')).toBeInTheDocument();
    expect(first.getByText('Warranty expiring')).toBeInTheDocument();
    expect(first.getByText('Asset ASSET-A-001')).toBeInTheDocument();
  });

  it('keeps sort (as a labelled select) and search', async () => {
    setViewport('phone');
    const spy = stubApi({ 'GET /packs': { body: page(packs) } });
    renderWithProviders(<PacksSection />, { me: makeMe() });
    await screen.findAllByRole('article');
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'remainingLife:asc');
    await waitFor(() =>
      expect(callsOf(spy).some(([u]) => u.includes('sort=remainingLife%3Aasc'))).toBe(true),
    );
    await userEvent.type(screen.getByLabelText('Search packs'), 'A-0001');
    await waitFor(() => expect(callsOf(spy).some(([u]) => u.includes('q=A-0001'))).toBe(true));
  });

  it('the wide layout has no sort select (the headers do that job)', async () => {
    setViewport('desktop');
    stubApi({ 'GET /packs': { body: page(packs) } });
    renderWithProviders(<PacksSection />, { me: makeMe() });
    await screen.findByRole('table');
    expect(screen.queryByLabelText('Sort by')).not.toBeInTheDocument();
  });
});

describe('PacksSection: the review findings', () => {
  it('announces the sort in the (stable) status text, and offers the same sorts as the table headers', async () => {
    setViewport('phone');
    stubApi({ 'GET /packs': { body: page(packs, 3) } });
    renderWithProviders(<PacksSection />, { me: makeMe() });
    await screen.findAllByRole('article');
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'sohPct:asc');
    expect(
      await screen.findByText(/sorted by state of health \(lowest first\)/),
    ).toBeInTheDocument();
    // Trend is shown, not sorted, in both layouts (the table has no trend header).
    const options = within(screen.getByLabelText('Sort by'))
      .getAllByRole('option')
      .map((o) => o.getAttribute('value'));
    expect(options.some((v) => v?.startsWith('trend'))).toBe(false);
  });

  it('steps back when the list shrinks under you (no phantom empty page)', async () => {
    let total = 40;
    stubApi({
      'GET /packs': (url) => {
        const p = Number(url.searchParams.get('page') ?? 1);
        const empty = (p - 1) * 25 >= total;
        return { body: page(empty ? [] : packs, total, p) };
      },
    });
    const { client } = renderWithProviders(<PacksSection />, { me: makeMe() });
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: /next page of packs/i }));
    expect(await screen.findByText(/Showing 26–40 of 40 packs/)).toBeInTheDocument();
    total = 20; // e.g. packs were retired: page 2 no longer exists
    await client.invalidateQueries({ queryKey: ['packs'] });
    expect(await screen.findByText(/Showing 1–20 of 20 packs/)).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('a new search starts from page 1 once the term settles, without an extra request per keystroke', async () => {
    const spy = stubApi({
      'GET /packs': (url) => ({ body: page(packs, 40, Number(url.searchParams.get('page') ?? 1)) }),
    });
    renderWithProviders(<PacksSection />, { me: makeMe() });
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: /next page of packs/i }));
    await screen.findByText(/Showing 26–40/);
    const before = callsOf(spy).length;
    await userEvent.type(screen.getByLabelText('Search packs'), 'abc');
    await waitFor(() =>
      expect(callsOf(spy).some(([u]) => u.includes('q=abc') && u.includes('page=1'))).toBe(true),
    );
    // No request that mixes the old term with page 1 (the wasted fetch the review found).
    expect(
      callsOf(spy)
        .slice(before)
        .every(([u]) => !(u.includes('page=1') && !u.includes('q='))),
    ).toBe(true);
  });

  it('the scrollable table is a labelled, keyboard-focusable region, with the serial as its row header', async () => {
    stubApi({ 'GET /packs': { body: page(packs) } });
    renderWithProviders(<PacksSection />, { me: makeMe() });
    const region = await screen.findByRole('region', { name: 'Packs table' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(within(region).getAllByRole('rowheader')[0]).toHaveTextContent('QL-A-0001');
  });
});
