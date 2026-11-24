// The BPTE client-layer mockup: the manufacturer's own view, on sample data. Loaded only when the app
// is built with VITE_DEMO=true (see App.tsx), so none of it reaches a normal bundle.
import { useEffect, type ReactNode } from 'react';
import { BatteryView } from './battery/BatteryView';
import { ConnectionView } from './connection/ConnectionView';
import { ImportsView } from './imports/ImportsView';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { InlineNotification } from '../../components/ui/inline-notification';
import { Skeleton } from '../../components/ui/skeleton';
import { usePageTitle } from '../../lib/usePageTitle';
import { FleetView } from './fleet/FleetView';
import { useDemoSession } from './session';
import { Shell } from './Shell';
import { SignIn } from './SignIn';
import './theme.css';

function Centered({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-12">
      {children}
    </main>
  );
}

function SessionGate({ signedOut }: { signedOut: 'redirect' | 'render' }) {
  const s = useDemoSession();
  if (s.status === 'loading')
    return (
      <Centered>
        <span className="sr-only" role="status">Loading your account</span>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-24 w-full" />
      </Centered>
    );
  if (s.status === 'error')
    return (
      <Centered>
        <InlineNotification
          kind="error"
          title="We could not check who is signed in"
          action={<Button size="sm" variant="tertiary" onClick={s.refetch}>Try again</Button>}
        >
          Try again. If it keeps failing, use Reset demo above.
        </InlineNotification>
      </Centered>
    );
  if (signedOut === 'render') return s.status === 'signedIn' ? <Navigate to="/" replace /> : <SignIn />;
  if (s.status !== 'signedIn') return <Navigate to="/login" replace />;
  return <Shell me={s.me} />;
}

function NotFound() {
  usePageTitle('Page not found');
  return (
    <div className="mx-auto max-w-[1312px] px-4 pt-6 lg:px-8">
      <h1 className="text-[28px] leading-9">Page not found</h1>
      <p className="mt-3">That address does not exist in this demo.</p>
      <Link to="/" className="mt-4 inline-block text-cds-interactive hover:underline">
        Back to the fleet overview
      </Link>
    </div>
  );
}

export default function DemoApp() {
  // Popovers and the menu sheet render outside this tree, so the type and colour tokens go on <body>.
  useEffect(() => {
    document.body.classList.add('bpte');
    return () => document.body.classList.remove('bpte');
  }, []);
  return (
    <Routes>
      <Route path="/login" element={<SessionGate signedOut="render" />} />
      <Route element={<SessionGate signedOut="redirect" />}>
        <Route index element={<FleetView />} />
        <Route path="batteries/:batteryId" element={<BatteryView />} />
        <Route path="imports" element={<ImportsView />} />
        <Route path="connection" element={<ConnectionView />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
