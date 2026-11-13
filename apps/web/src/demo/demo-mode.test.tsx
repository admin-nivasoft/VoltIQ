import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoBanner } from '../components/DemoBanner';
import DevLoginSwitcher from '../features/dev/DevLoginSwitcher';
import { renderWithProviders } from '../test/utils';
import App from '../app/App';

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

  it('App shows it on every page of a demo build, and not at all otherwise', () => {
    vi.stubEnv('VITE_DEMO', 'true');
    const { unmount } = render(<App />);
    expect(screen.getByRole('complementary', { name: 'Demo notice' })).toBeInTheDocument();
    unmount();
    vi.stubEnv('VITE_DEMO', 'false');
    render(<App />);
    expect(screen.queryByRole('complementary', { name: 'Demo notice' })).not.toBeInTheDocument();
  });
});

describe('the sign-in picker in demo wording', () => {
  it('uses friendly text and the demo companies, with no development-tool wording', () => {
    vi.stubEnv('VITE_DEMO', 'true');
    renderWithProviders(<DevLoginSwitcher demo />, { me: null });
    expect(screen.getByRole('heading', { name: 'Choose a demo user' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Aurora Motors/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Meridian Storage Systems/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Northgate Logistics/ })).toBeInTheDocument();
    expect(screen.queryByText(/Development login/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Not for production/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(10);
  });
});

describe('the API client in a demo build answers from the browser, with no network', () => {
  it('signs in, reads /me through the contracts schema, and never calls fetch', async () => {
    vi.stubEnv('VITE_DEMO', 'true');
    const fetchSpy = vi.fn(() => Promise.reject(new Error('the network must not be used')));
    vi.stubGlobal('fetch', fetchSpy);
    vi.resetModules(); // client.ts reads the flag when it loads; it imports no React, so this is safe
    const { api } = await import('../lib/api/client');
    const { mockLogin } = await import('../features/dev/mockLogin');
    const { setDemoLatency, resetDemo } = await import('./handler');
    setDemoLatency(0);
    resetDemo();
    expect(await api.me()).toBeNull();
    await mockLogin('e0000001-0000-4000-8000-000000000001');
    const me = await api.me();
    expect(me?.user.name).toBe('Priya Nair');
    expect(me?.consumer?.name).toBe('Aurora Motors (OEM)');
    expect(fetchSpy).not.toHaveBeenCalled();
    resetDemo();
  });
});
