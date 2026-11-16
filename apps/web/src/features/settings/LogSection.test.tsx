import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callsOf, makeMe, page, renderWithProviders, setViewport, stubApi } from '../../test/utils';
import { LogSection } from './LogSection';

afterEach(() => vi.unstubAllGlobals());

const entry = (n: number, over: object = {}) => ({
  id: `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`,
  alertId: null,
  kind: 'test',
  channel: 'email',
  status: 'sent',
  attempt: 1,
  error: null,
  at: '2026-11-13T10:00:00.000Z',
  ...over,
});
const items = [
  entry(1, {
    status: 'failed',
    error: 'mock_delivery_failed',
    attempt: 3,
    kind: 'alert',
    alertId: '44444444-4444-4444-8444-444444444444',
    channel: 'sms',
  }),
  entry(2),
  entry(3, { status: 'failed', error: 'delivery_timeout', channel: 'webhook' }),
];

describe('LogSection', () => {
  it('lists every attempt: when, what, which channel, the result in words and an icon, and why it failed', async () => {
    stubApi({ 'GET /notification-log': { body: page(items) } });
    renderWithProviders(<LogSection />, { me: makeMe('consumer_admin') });
    const rows = await screen.findAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(within(rows[1]!).getByText('Alert')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Text message (SMS)')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Failed, attempt 3')).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/rejected this address/i)).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Delivered, attempt 1')).toBeInTheDocument();
    expect(within(rows[3]!).getByText(/took too long/i)).toBeInTheDocument();
    for (const svg of document.querySelectorAll('table svg'))
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(document.body).not.toHaveTextContent(/mock_delivery_failed|delivery_timeout/); // codes are never shown
  });

  it('the scrollable table is a labelled, focusable region', async () => {
    stubApi({ 'GET /notification-log': { body: page(items) } });
    renderWithProviders(<LogSection />, { me: makeMe('consumer_admin') });
    expect(await screen.findByRole('region', { name: 'Delivery log table' })).toHaveAttribute(
      'tabindex',
      '0',
    );
  });

  it('becomes cards on a phone, with the same facts', async () => {
    setViewport('phone');
    stubApi({ 'GET /notification-log': { body: page(items) } });
    renderWithProviders(<LogSection />, { me: makeMe('consumer_admin') });
    expect(await screen.findAllByRole('article')).toHaveLength(3);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      within(screen.getAllByRole('article')[0]!).getByText('Failed, attempt 3'),
    ).toBeInTheDocument();
  });

  it('pages 25 at a time', async () => {
    const spy = stubApi({
      'GET /notification-log': (url) => ({
        body: page(items, 60, Number(url.searchParams.get('page') ?? 1)),
      }),
    });
    renderWithProviders(<LogSection />, { me: makeMe('consumer_admin') });
    await screen.findAllByRole('row');
    expect(callsOf(spy)[0]![0]).toContain('pageSize=25');
    await userEvent.click(screen.getByRole('button', { name: /next page of delivery log/i }));
    await waitFor(() => expect(callsOf(spy).some(([u]) => u.includes('page=2'))).toBe(true));
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('has empty, loading and error states', async () => {
    let n = 0;
    stubApi({
      'GET /notification-log': () =>
        ++n === 1
          ? { status: 500, body: { error: { code: 'internal', message: 'x' } } }
          : { body: page([]) },
    });
    renderWithProviders(<LogSection />, { me: makeMe('consumer_admin') });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('heading', { name: 'No deliveries yet' })).toBeInTheDocument();
  });
});
