import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeMe, makeSummary, renderWithProviders, stubApi } from '../../test/utils';
import { SummaryTiles } from './SummaryTiles';

afterEach(() => vi.unstubAllGlobals());
const tile = (name: RegExp) => within(screen.getByText(name).closest('div') as HTMLElement);

describe('SummaryTiles', () => {
  it('shows the four headline figures, each with a label', async () => {
    stubApi({
      'GET /fleet/summary': {
        body: makeSummary({
          packsInService: 37,
          averageSohPct: 91.8,
          activeAlerts: 6,
          packsNearingEol: 7,
        }),
      },
    });
    renderWithProviders(<SummaryTiles />, { me: makeMe() });
    expect(await screen.findByText('Packs in service')).toBeInTheDocument();
    expect(tile(/Packs in service/).getByText('37')).toBeInTheDocument();
    expect(tile(/Average state of health/).getByText('91.8%')).toBeInTheDocument();
    expect(tile(/Active alerts/).getByText('6')).toBeInTheDocument();
    expect(tile(/nearing end of life/).getByText('7')).toBeInTheDocument();
  });

  it('shows a dash and a reason when there is no average yet', async () => {
    stubApi({
      'GET /fleet/summary': {
        body: makeSummary({
          packsInService: 0,
          averageSohPct: null,
          activeAlerts: 0,
          packsNearingEol: 0,
        }),
      },
    });
    renderWithProviders(<SummaryTiles />, { me: makeMe() });
    expect(await screen.findByText('—')).toBeInTheDocument();
    expect(screen.getByText(/no packs in service yet/i)).toBeInTheDocument();
  });

  it('is labelled as a region so it can be found by heading', async () => {
    stubApi({ 'GET /fleet/summary': { body: makeSummary() } });
    renderWithProviders(<SummaryTiles />, { me: makeMe() });
    expect(await screen.findByRole('region', { name: /fleet summary/i })).toBeInTheDocument();
  });

  it('shows a loading state, then an error with a working retry', async () => {
    let n = 0;
    stubApi({
      'GET /fleet/summary': () =>
        ++n === 1
          ? { status: 500, body: { error: { code: 'internal', message: 'x' } } }
          : { body: makeSummary() },
    });
    renderWithProviders(<SummaryTiles />, { me: makeMe() });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Packs in service')).toBeInTheDocument();
  });

  it('keeps showing the numbers, with a notice and the time, when a refresh fails', async () => {
    let n = 0;
    stubApi({
      'GET /fleet/summary': () =>
        ++n === 1
          ? { body: makeSummary({ activeAlerts: 4 }) }
          : { status: 500, body: { error: { code: 'internal', message: 'x' } } },
    });
    const { client } = renderWithProviders(<SummaryTiles />, { me: makeMe() });
    await screen.findByText('Active alerts');
    await client.invalidateQueries({ queryKey: ['fleet', 'summary'] });
    expect(await screen.findByText(/couldn.t refresh the fleet summary/i)).toBeInTheDocument();
    expect(tile(/Active alerts/).getByText('4')).toBeInTheDocument();
  });
});
