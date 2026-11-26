import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, LogOut, Menu, Moon, RadioTower, Sun, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
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
  { to: '/', label: 'Battery overview', icon: LayoutDashboard, end: true },
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
    <nav aria-label="Main" className="px-2 py-3">
      <ul className="space-y-0.5">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex h-8 items-center gap-2 rounded-md px-2 text-[13px] font-medium text-cds-text-secondary hover:bg-cds-layer-hover hover:text-cds-text-primary',
                  isActive &&
                    'bg-cds-layer-selected text-cds-text-primary',
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

type Theme = 'light' | 'dark';
const THEME_KEY = 'bpte-theme';

function storedTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

// Apply the saved choice as soon as the demo loads, so the sign-in page is themed too.
if (typeof document !== 'undefined') applyTheme(storedTheme());

/** Light/dark switch. The choice is kept in localStorage (when available) and set on <html>. */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(storedTheme);
  useEffect(() => applyTheme(theme), [theme]);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const Icon = theme === 'dark' ? Sun : Moon;
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => {
        setTheme(next);
        try {
          window.localStorage.setItem(THEME_KEY, next);
        } catch {
          /* storage blocked: the choice just lasts for this visit */
        }
      }}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-cds-text-secondary hover:bg-cds-layer-hover hover:text-cds-text-primary',
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <m.span
          key={theme}
          className="inline-flex"
          initial={{ opacity: 0, rotate: -30 }}
          animate={{ opacity: 1, rotate: 0 }}
          exit={{ opacity: 0, rotate: 30 }}
          transition={{ duration: 0.12 }}
        >
          <Icon aria-hidden="true" className="h-4 w-4" />
        </m.span>
      </AnimatePresence>
    </button>
  );
}

/**
 * Linear-style shell: a slim top bar (product, manufacturer, last update, signed-in user, theme,
 * sign out) and a left sidebar on a light surface. Below 1024px the sidebar becomes a slide-in sheet.
 */
export function Shell({ me }: { me: DemoMe }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const signOut = useSignOut();
  const navigate = useNavigate();
  const overview = useOverview();
  const updated = overview.data?.updated.bms;

  return (
    <div className="min-h-screen">
      <header
        data-shell
        className="sticky top-0 z-30 flex h-11 items-center gap-1 border-b border-cds-border-subtle bg-cds-shell-bg bg-[image:var(--cds-bar-bg)] px-2 text-cds-shell-text"
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-cds-interactive focus:px-3 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger
            aria-label="Open menu"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-cds-shell-hover lg:hidden"
          >
            <Menu aria-hidden="true" className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent aria-describedby={undefined}>
            <div className="flex h-11 items-center border-b border-cds-border-subtle px-4">
              <SheetTitle className="font-semibold">{PRODUCT_NAME}</SheetTitle>
            </div>
            <SheetDescription className="sr-only">Main navigation</SheetDescription>
            <SideNav onNavigate={() => setMenuOpen(false)} />
          </SheetContent>
        </Sheet>
        <p className="flex min-w-0 items-center gap-2 whitespace-nowrap px-2 text-[13px]">
          <span className="font-semibold">{PRODUCT_NAME}</span>
          <span aria-hidden="true" className="hidden text-cds-border-strong sm:inline">
            /
          </span>
          <span className="hidden truncate text-cds-text-secondary sm:inline">{me.manufacturer.name}</span>
        </p>
        <div className="ml-auto flex h-full items-center gap-1">
          {updated ? (
            <p className="hidden items-center gap-1 px-2 text-xs leading-4 text-cds-text-helper md:flex">
              BMS data received{' '}
              <time dateTime={updated} title={dateTime(updated)} className="text-cds-text-secondary">
                {ago(updated)}
              </time>
            </p>
          ) : null}
          <p className="flex flex-col justify-center border-l border-cds-border-subtle px-3 text-right">
            <span className="text-[13px] leading-4">{me.user.name}</span>
            <span className="text-xs leading-4 text-cds-text-helper">{ROLE_LABEL[me.user.role]}</span>
          </p>
          <ThemeToggle />
          <button
            type="button"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => signOut.mutate(undefined, { onSuccess: () => navigate('/login') })}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-cds-text-secondary hover:bg-cds-shell-hover hover:text-cds-text-primary"
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </header>
      <div className="flex">
        <aside className="hidden w-56 shrink-0 border-r border-cds-border-subtle bg-cds-layer bg-[image:var(--cds-bar-bg)] lg:block">
          <div className="sticky top-11">
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
