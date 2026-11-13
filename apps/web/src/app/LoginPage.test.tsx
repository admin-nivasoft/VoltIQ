import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/utils';
import { LoginPage, LoginView } from './LoginPage';

describe('LoginPage', () => {
  it('in mock mode (the test environment) shows the development switcher', async () => {
    renderWithProviders(<LoginPage />, { me: null });
    expect(await screen.findByRole('region', { name: /development login/i })).toBeInTheDocument();
  });
});

describe('LoginView without a switcher (what a production build renders)', () => {
  it('explains that sign-in is not set up, and offers no controls', () => {
    renderWithProviders(<LoginView switcher={null} />, { me: null });
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByText(/not set up for this environment/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /development login/i })).not.toBeInTheDocument();
  });
});
