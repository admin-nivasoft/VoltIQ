import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ME_KEY } from '../lib/auth/session';
import { makeMe, renderWithProviders, stubFetch, testClient } from '../test/utils';
import { AppRoutes } from './App';
import { Layout } from './Layout';

afterEach(() => {
  vi.unstubAllGlobals();
  document.title = '';
});

describe('a failed background refresh does not blank a signed-in screen', () => {
  it('keeps the shell and the page when the next /me poll fails', async () => {
    const client = testClient();
    stubFetch(() => ({ status: 500, body: { error: { code: 'internal', message: 'x' } } }));
    renderWithProviders(<AppRoutes />, { me: makeMe('fleet_manager'), client });
    expect(
      await screen.findByRole('heading', { level: 1, name: /fleet health/i }),
    ).toBeInTheDocument();
    await client.invalidateQueries({ queryKey: ME_KEY }); // this refetch fails
    await waitFor(() => expect(client.getQueryState(ME_KEY)?.status).toBe('error'));
    expect(screen.getByRole('heading', { level: 1, name: /fleet health/i })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a 401 on a later poll does sign the user out (the session really ended)', async () => {
    const client = testClient();
    stubFetch(() => ({
      status: 401,
      body: { error: { code: 'unauthenticated', message: 'Sign in required' } },
    }));
    renderWithProviders(<AppRoutes />, { me: makeMe('fleet_manager'), client });
    await client.invalidateQueries({ queryKey: ME_KEY });
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
  });
});

describe('document title and focus on every page', () => {
  it('each page sets its own title', async () => {
    renderWithProviders(<AppRoutes />, { me: makeMe('fleet_manager'), route: '/' });
    await waitFor(() => expect(document.title).toBe('Fleet health · 82V QualityLoop'));
  });

  it.each([
    ['/settings', 'Settings'],
    ['/nope', 'Page not found'],
  ])('%s is titled %s', async (route, title) => {
    renderWithProviders(<AppRoutes />, { me: makeMe('fleet_manager'), route });
    await waitFor(() => expect(document.title).toBe(`${title} · 82V QualityLoop`));
  });

  it('the sign-in page has its own title and takes focus when nothing else has it', async () => {
    renderWithProviders(<AppRoutes />, { me: null, route: '/login' });
    await waitFor(() => expect(document.title).toBe('Sign in · 82V QualityLoop'));
    expect(screen.getByRole('heading', { name: /sign in/i })).toHaveFocus();
  });

  it('following a navigation link moves focus to the new page heading', async () => {
    renderWithProviders(<AppRoutes />, { me: makeMe('fleet_manager'), route: '/' });
    await userEvent.click(await screen.findByRole('link', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toHaveFocus();
  });

  it('the skip link points at a main landmark that can take focus', async () => {
    renderWithProviders(<AppRoutes />, { me: makeMe('fleet_manager') });
    const skip = await screen.findByRole('link', { name: /skip to main content/i });
    const target = document.querySelector(skip.getAttribute('href')!);
    expect(target).toBe(screen.getByRole('main'));
    expect(target).toHaveAttribute('tabindex', '-1');
  });

  it('loading and error screens still have a main landmark', async () => {
    stubFetch(() => new Promise(() => {}) as never);
    renderWithProviders(<AppRoutes />, { client: testClient(), route: '/' });
    expect(screen.getByRole('main')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/loading your account/i),
    );
  });
});

describe('sign out', () => {
  const shell = (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<p>page body</p>} />
        <Route path="/login" element={<p>login page</p>} />
      </Route>
    </Routes>
  );

  it('a failed sign-out keeps the user signed in and says so', async () => {
    stubFetch(() => ({ status: 500, body: { error: { code: 'internal', message: 'x' } } }));
    const { client } = renderWithProviders(shell, { me: makeMe('fleet_manager') });
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t sign you out/i);
    expect(client.getQueryData(ME_KEY)).not.toBeNull();
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
  });

  it('cannot be submitted twice while in flight', async () => {
    const spy = stubFetch(() => new Promise(() => {}) as never);
    renderWithProviders(shell, { me: makeMe('fleet_manager') });
    const button = screen.getByRole('button', { name: /sign out/i });
    await userEvent.click(button);
    const busy = await screen.findByRole('button', { name: /signing out/i });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(busy);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('works from the keyboard (Enter and Space)', async () => {
    const spy = stubFetch(() => ({ status: 204 }));
    renderWithProviders(shell, { me: makeMe('fleet_manager') });
    screen.getByRole('button', { name: /sign out/i }).focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('error state keyboard use', () => {
  it('Try again can be used from the keyboard', async () => {
    let calls = 0;
    stubFetch(() =>
      ++calls === 1
        ? { status: 500, body: { error: { code: 'internal', message: 'x' } } }
        : { body: makeMe('fleet_manager') },
    );
    renderWithProviders(<AppRoutes />, { client: testClient(), route: '/' });
    const retry = await screen.findByRole('button', { name: /try again/i });
    retry.focus();
    await userEvent.keyboard(' ');
    expect(
      await screen.findByRole('heading', { level: 1, name: /fleet health/i }),
    ).toBeInTheDocument();
  });

  it('the sign-in page shows an error with retry when /me fails, not "not set up"', async () => {
    stubFetch(() => ({ status: 500, body: { error: { code: 'internal', message: 'x' } } }));
    renderWithProviders(<AppRoutes />, { client: testClient(), route: '/login' });
    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
    expect(screen.queryByText(/not set up for this environment/i)).not.toBeInTheDocument();
  });
});

describe('header details', () => {
  it('only a same-origin logo path is used as an image', () => {
    for (const logoUrl of [
      'https://tracker.example/logo.png',
      '//evil.example/x.svg',
      'javascript:alert(1)',
    ]) {
      const me = makeMe('fleet_manager');
      me.manufacturer = { name: '82 Volts', logoUrl };
      const { unmount } = renderWithProviders(
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<p>x</p>} />
          </Route>
        </Routes>,
        { me },
      );
      expect(
        within(screen.getByRole('banner')).queryByRole('img'),
        logoUrl,
      ).not.toBeInTheDocument();
      unmount();
    }
  });
});
