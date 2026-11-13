import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeMe, renderWithProviders } from '../test/utils';
import { Can } from './Can';

afterEach(() => vi.unstubAllGlobals());

const ui = (
  <Can permission="alerts.acknowledge" fallback={<span>read only</span>}>
    <button type="button">Acknowledge</button>
  </Can>
);

describe('<Can>', () => {
  it('shows its children when the permission is granted', () => {
    renderWithProviders(ui, { me: makeMe('fleet_manager') });
    expect(screen.getByRole('button', { name: 'Acknowledge' })).toBeInTheDocument();
    expect(screen.queryByText('read only')).not.toBeInTheDocument();
  });

  it('hides its children and shows the fallback when the permission is missing', () => {
    renderWithProviders(ui, { me: makeMe('technician') });
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).not.toBeInTheDocument();
    expect(screen.getByText('read only')).toBeInTheDocument();
  });

  it('decides by the permission list, never the role name', () => {
    // A technician granted the permission by the policy sees the control.
    const me = makeMe('technician');
    me.permissions = [...me.permissions, 'alerts.acknowledge'];
    const first = renderWithProviders(ui, { me });
    expect(screen.getByRole('button', { name: 'Acknowledge' })).toBeInTheDocument();
    first.unmount();
    // A fleet manager whose policy dropped it does not.
    const fm = makeMe('fleet_manager');
    fm.permissions = fm.permissions.filter((p) => p !== 'alerts.acknowledge');
    renderWithProviders(ui, { me: fm });
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).not.toBeInTheDocument();
  });

  it('hides everything when signed out, and renders nothing special without a fallback', () => {
    renderWithProviders(
      <Can permission="fleet.view">
        <p>secret</p>
      </Can>,
      { me: null },
    );
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('shows nothing (not the children) while the user is still loading', () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    renderWithProviders(
      <Can permission="fleet.view">
        <p>secret</p>
      </Can>,
      {},
    );
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('the platform admin holds only permissions.manage', () => {
    renderWithProviders(
      <>
        <Can permission="fleet.view">
          <p>fleet</p>
        </Can>
        <Can permission="permissions.manage">
          <p>policy</p>
        </Can>
      </>,
      { me: makeMe('platform_admin') },
    );
    expect(screen.queryByText('fleet')).not.toBeInTheDocument();
    expect(screen.getByText('policy')).toBeInTheDocument();
  });
});
