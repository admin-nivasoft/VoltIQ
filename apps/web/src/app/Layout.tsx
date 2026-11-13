import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Role } from '@ql/contracts';
import { api } from '../lib/api/client';
import { ME_KEY, useCan, useSession } from '../lib/auth/session';
import { PRODUCT_NAME } from '../lib/product';

// Display text only. Access is decided by permissions from /me, never by these names.
const ROLE_LABEL: Record<Role, string> = {
  fleet_manager: 'Fleet manager',
  technician: 'Technician',
  consumer_admin: 'Consumer admin',
  platform_admin: 'Platform admin',
};

const navLink = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 items-center rounded-md px-3 font-medium ${
    isActive ? 'bg-white text-slate-900' : 'text-white underline-offset-4 hover:underline'
  }`;

/** Only a same-origin path is used as the logo, so the API can never point the page at a third-party image. */
const sameOriginPath = (url: string | null | undefined): url is string =>
  !!url && url.startsWith('/') && !url.startsWith('//');

export function Layout() {
  const { me } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const canFleet = useCan('fleet.view');
  const canSettings = useCan('channels.manage_own', 'permissions.manage', 'notifications.view_log');

  // A route change moves focus to the new page's heading, so keyboard and screen-reader users know.
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current !== pathname) {
      previous.current = pathname;
      document.querySelector<HTMLElement>('main h1')?.focus();
    }
  }, [pathname]);

  const signOut = useMutation({
    mutationFn: api.logout,
    // Only a confirmed sign-out clears the session. If the call fails the cookie is still valid, so
    // pretending to be signed out would just bounce the user back in on the next refresh.
    onSuccess: () => {
      qc.setQueryData(ME_KEY, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      navigate('/login');
    },
  });

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only min-h-11 focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-md focus:bg-white focus:px-4 focus:text-slate-900 focus-visible:outline-white"
      >
        Skip to main content
      </a>
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {sameOriginPath(me?.manufacturer?.logoUrl) ? (
              <img
                src={me?.manufacturer?.logoUrl ?? ''}
                alt={`${me?.manufacturer?.name ?? ''} logo`}
                className="h-10 w-10 shrink-0 rounded-md object-contain"
              />
            ) : null}
            <div className="min-w-0 break-words">
              <p className="text-sm text-slate-200">{`${PRODUCT_NAME} · Fleet Health`}</p>
              <p className="text-lg font-semibold leading-tight">
                {me?.consumer ? me.consumer.name : 'Platform administration'}
              </p>
              {me?.manufacturer ? (
                <p className="text-sm text-slate-200">{`Packs supplied by ${me.manufacturer.name}`}</p>
              ) : null}
            </div>
          </div>

          <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
            {canFleet ? (
              <NavLink to="/" end className={navLink}>
                Fleet health
              </NavLink>
            ) : null}
            {canSettings ? (
              <NavLink to="/settings" className={navLink}>
                Settings
              </NavLink>
            ) : null}
          </nav>

          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-3">
            {me ? (
              <p className="min-w-0 break-words text-sm">
                <span className="font-medium">{me.user.name}</span>
                <span className="text-slate-200"> · </span>
                <span>{ROLE_LABEL[me.user.role]}</span>
              </p>
            ) : null}
            <button
              type="button"
              aria-disabled={signOut.isPending}
              onClick={() => {
                if (!signOut.isPending) signOut.mutate();
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white px-3 font-medium hover:bg-white hover:text-slate-900"
            >
              <LogOut aria-hidden="true" className="h-4 w-4" />
              {signOut.isPending ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </header>
      {signOut.isError ? (
        <div role="alert" className="border-b border-red-300 bg-red-50 px-4 py-3 text-red-900">
          We couldn&apos;t sign you out. Please try again.
        </div>
      ) : null}
      <main id="main" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 focus:outline-none">
        <Outlet />
      </main>
    </div>
  );
}
