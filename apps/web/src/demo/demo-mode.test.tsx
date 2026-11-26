import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../app/App';
import { DemoBanner } from '../components/DemoBanner';
import { resetDemo, setDemoLatency } from './handler';

// App decides at load time whether it is a demo build, so this file loads it as one. The cases for
// "not a demo" are the API client test below and the production-bundle tests in src/bundle.test.ts.
vi.hoisted(() => {
  process.env.VITE_DEMO = 'true';
});

// The first render loads the whole lazy demo bundle, which can take a few seconds on a cold start.
const SLOW = { timeout: 20_000 };
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  setDemoLatency(0);
  resetDemo();
  sessionStorage.clear();
  window.history.pushState({}, '', '/');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('DemoBanner', () => {
  it('says plainly that this is a demo on sample data, and offers a reset', async () => {
    const reset = vi.fn();
    render(<DemoBanner onReset={reset} />);
    const notice = screen.getByRole('complementary', { name: 'Demo notice' });
    expect(notice).toHaveTextContent('DEMO');
    expect(notice).toHaveTextContent(/sample data only/i);
    expect(notice).toHaveTextContent(/nothing is saved/i);
    await userEvent.click(screen.getByRole('button', { name: 'Reset demo' }));
    expect(reset).toHaveBeenCalledOnce();
    expect(notice.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

// The first render lazy-loads the demo app chunk (now with the motion library); a cold load in a full
// parallel run can pass 5 s, so this group gets 15 s.
describe('App in a demo build', { timeout: 15_000 }, () => {
  it('shows the banner and the demo sign-in for Lumen Ridge only', async () => {
    render(<App />);
    expect(screen.getByRole('complementary', { name: 'Demo notice' })).toHaveTextContent(/sample data only/i);
    expect(await screen.findByRole('heading', { name: 'Choose a demo user' }, SLOW)).toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Lumen Ridge Batteries · battery manufacturer' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      expect.stringContaining('Battery manager'),
      expect.stringContaining('Admin'),
    ]);
    expect(within(group).getByRole('button', { name: /Battery manager.*Ananya Desai/ })).toBeVisible();
    expect(within(group).getByRole('button', { name: /Admin.*Rohan Mehta/ })).toBeVisible();
    // The second manufacturer is for isolation checks only and is never offered.
    expect(screen.queryByText(/Corvane/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ines Varga|Tomas Lindqvist/)).not.toBeInTheDocument();
    // The old consumer portal wording is gone.
    expect(screen.queryByText(/Aurora Motors|Meridian|Northgate|Development login/)).not.toBeInTheDocument();
  });

  it('signing in as a battery manager opens the battery overview, and the banner stays', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /Battery manager/ }, SLOW));
    expect(await screen.findByRole('heading', { level: 1, name: 'Battery overview' }, SLOW)).toBeInTheDocument();
    expect(screen.getByText('Ananya Desai')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Demo notice' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Needs attention' }, SLOW)).toBeInTheDocument();
  });

  it('a signed-out visit to another page goes to the sign-in', async () => {
    window.history.pushState({}, '', '/connection');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Choose a demo user' }, SLOW)).toBeInTheDocument();
  });
});

describe('the API client in a demo build answers from the browser, with no network', () => {
  it('signs in, reads /me through the demo schema, and never calls fetch', async () => {
    vi.stubEnv('VITE_DEMO', 'true');
    const fetchSpy = vi.fn(() => Promise.reject(new Error('the network must not be used')));
    vi.stubGlobal('fetch', fetchSpy);
    vi.resetModules(); // client.ts reads the flag when it loads; it imports no React, so this is safe
    const { apiFetch, ApiError } = await import('../lib/api/client');
    const { DemoMeSchema, FleetOverviewSchema } = await import('./types');
    const handler = await import('./handler');
    const { USERS } = await import('./data');
    handler.setDemoLatency(0);
    handler.resetDemo();
    const ananya = USERS.find((u) => u.name === 'Ananya Desai')!;

    await expect(apiFetch('/me', { schema: DemoMeSchema })).rejects.toMatchObject({ status: 401 });
    await apiFetch('/auth/mock-login', { method: 'POST', body: { userId: ananya.id } });
    const me = await apiFetch('/me', { schema: DemoMeSchema });
    expect(me.user.name).toBe('Ananya Desai');
    expect(me.manufacturer.name).toBe('Lumen Ridge Batteries');
    const overview = await apiFetch('/fleet/overview', { schema: FleetOverviewSchema });
    expect(overview.registered.value).toBe(48);
    // A refusal comes back as an ApiError with the handler's status, not a network failure.
    const refused = apiFetch('/imports', { method: 'POST', body: {} });
    await expect(refused).rejects.toBeInstanceOf(ApiError);
    await expect(refused).rejects.toMatchObject({ status: 403 });
    expect(fetchSpy).not.toHaveBeenCalled();
    handler.resetDemo();
  });

  it('outside a demo build the client does use fetch (so the check above can fail)', async () => {
    vi.stubEnv('VITE_DEMO', 'false');
    const fetchSpy = vi.fn(() => Promise.resolve(new Response('{}', { status: 401 })));
    vi.stubGlobal('fetch', fetchSpy);
    vi.resetModules();
    const { apiFetch } = await import('../lib/api/client');
    await expect(apiFetch('/me')).rejects.toMatchObject({ status: 401 });
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});
