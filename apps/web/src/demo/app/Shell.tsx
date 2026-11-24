import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, LogOut, Menu, RadioTower, Upload } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '../../components/ui/sheet';
import { apiFetch } from '../../lib/api/client';
import { cn } from '../../lib/cn';
import { PRODUCT_NAME } from '../../lib/product';
import { ROLE_LABEL } from '../roles';
import { FleetOverviewSchema, type DemoMe } from '../types';
import { ago, dateTime } from './format';
import { useSignOut } from './session';

const NAV = [
  { to: '/', label: 'Fleet overview', icon: LayoutDashboard, end: true },
  { to: '/imports', label: 'Factory data import', icon: Upload, end: false },
  { to: '/connection', label: 'Data connection', icon: RadioTower, end: false },
] as const;

/** The overview query doubles as the shell's "last updated" source, so it is shared, not refetched. */
export const useOverview = () =>
  useQuery({
    queryKey: ['demo', 'fleet', 'overview'],
    queryFn: () => apiFetch('/fleet/overview', { schema: FleetOverviewSchema }),
  });

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="py-4">
      <ul>
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'relative flex h-10 items-center gap-3 px-4 text-sm font-semibold text-cds-text-secondary hover:bg-cds-layer-hover hover:text-cds-text-primary',
                  isActive &&
                    'bg-cds-layer-selected text-cds-text-primary before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-cds-interactive',
                )
              }
            >
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Carbon UI shell: a fixed 48px dark header (product, manufacturer, signed-in user, last update) and
 * a left side nav. On screens narrower than 1056px the side nav becomes a slide-in sheet.
 */
export function Shell({ me }: { me: DemoMe }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const signOut = useSignOut();
  const navigate = useNavigate();
  const overview = useOverview();
  const updated = overview.data?.updated.bms;

  return (
    <div className="min-h-screen bg-cds-background">
      <header
        data-shell
        className="sticky top-0 z-30 flex h-12 items-center border-b border-[#393939] bg-cds-shell-bg text-cds-shell-text"
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-0 focus:top-0 focus:z-50 focus:bg-cds-interactive focus:px-4 focus:py-3 focus:text-white"
        >
          Skip to content
        </a>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger
            aria-label="Open menu"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center hover:bg-cds-shell-hover lg:hidden"
          >
            <Menu aria-hidden="true" className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent aria-describedby={undefined}>
            <div className="flex h-12 items-center border-b border-cds-border-subtle px-4">
              <SheetTitle className="font-semibold">{PRODUCT_NAME}</SheetTitle>
            </div>
            <SheetDescription className="sr-only">Main navigation</SheetDescription>
            <SideNav onNavigate={() => setMenuOpen(false)} />
          </SheetContent>
        </Sheet>
        <p className="flex min-w-0 items-center gap-2 whitespace-nowrap px-2 text-sm lg:px-4">
          <span className="font-semibold">{PRODUCT_NAME}</span>
          <span aria-hidden="true" className="hidden text-[#8d8d8d] sm:inline">
            |
          </span>
          <span className="hidden truncate sm:inline">{me.manufacturer.name}</span>
        </p>
        <div className="ml-auto flex h-full items-center">
          {updated ? (
            <p className="hidden h-full items-center gap-1 border-l border-[#393939] px-4 text-xs leading-4 text-[#c6c6c6] md:flex">
              BMS data received{' '}
              <time dateTime={updated} title={dateTime(updated)} className="text-cds-shell-text">
                {ago(updated)}
              </time>
            </p>
          ) : null}
          <p className="flex h-full flex-col justify-center border-l border-[#393939] px-4 text-right">
            <span className="text-sm leading-4">{me.user.name}</span>
            <span className="text-xs leading-4 text-[#c6c6c6]">{ROLE_LABEL[me.user.role]}</span>
          </p>
          <button
            type="button"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => signOut.mutate(undefined, { onSuccess: () => navigate('/login') })}
            className="inline-flex h-12 w-12 items-center justify-center border-l border-[#393939] hover:bg-cds-shell-hover"
          >
            <LogOut aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
      </header>
      <div className="flex">
        <aside className="hidden w-64 shrink-0 border-r border-cds-border-subtle bg-cds-layer lg:block">
          <div className="sticky top-12">
            <SideNav />
          </div>
        </aside>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
