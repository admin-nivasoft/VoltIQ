import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { DemoBanner } from '../components/DemoBanner';
import { PageHeading } from '../components/ui/PageHeading';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states';
import { FleetPage } from '../features/fleet/FleetPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { useSession } from '../lib/auth/session';
import { Layout } from './Layout';
import { LoginPage } from './LoginPage';
import { createQueryClient } from './queryClient';

/** Gives loading and error screens a main landmark, since the full layout is not on the page yet. */
function ShellState({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-10">
      {children}
    </main>
  );
}

/** Everything inside needs a signed-in user. Failing to find out who is signed in is an error, not "signed out". */
function RequireAuth() {
  const s = useSession();
  if (s.status === 'loading')
    return (
      <ShellState>
        <LoadingState label="Loading your account" />
      </ShellState>
    );
  if (s.status === 'error')
    return (
      <ShellState>
        <ErrorState error={s.error} onRetry={s.refetch} />
      </ShellState>
    );
  if (s.status === 'signedOut') return <Navigate to="/login" replace />;
  return <Outlet />;
}

function LoginRoute() {
  const s = useSession();
  if (s.status === 'loading')
    return (
      <ShellState>
        <LoadingState label="Loading" />
      </ShellState>
    );
  if (s.status === 'error')
    return (
      <ShellState>
        <ErrorState error={s.error} onRetry={s.refetch} />
      </ShellState>
    );
  if (s.status === 'signedIn') return <Navigate to="/" replace />;
  return <LoginPage />;
}

function NotFoundPage() {
  return (
    <div className="space-y-6">
      <PageHeading>Page not found</PageHeading>
      <EmptyState
        title="That address does not exist"
        action={
          <Link
            to="/"
            className="inline-flex min-h-11 items-center font-medium text-blue-800 underline"
          >
            Fleet health
          </Link>
        }
      />
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<FleetPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

/** Forgets the demo user and every change, then reloads from the sample data. Demo builds only. */
async function resetAndReload() {
  if (import.meta.env.VITE_DEMO === 'true') (await import('../demo/handler')).resetDemo();
  window.location.assign('/');
}

export default function App() {
  const [client] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client}>
      {import.meta.env.VITE_DEMO === 'true' ? <DemoBanner onReset={resetAndReload} /> : null}
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
