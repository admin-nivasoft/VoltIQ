import { lazy, Suspense, type ReactNode } from 'react';
import { PageHeading } from '../components/ui/PageHeading';
import { LoadingState } from '../components/ui/states';

// The switcher is imported only when the build says so. Vite replaces the literal at build time, so
// with VITE_MOCK_AUTH anything but "true" this branch, and the whole dev module, is dropped (D-08).
const DevLoginSwitcher =
  import.meta.env.VITE_MOCK_AUTH === 'true' || import.meta.env.VITE_DEMO === 'true'
    ? lazy(() => import('../features/dev/DevLoginSwitcher'))
    : null;

export function LoginView({ switcher }: { switcher: ReactNode | null }) {
  return (
    <main id="main" className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <PageHeading>Sign in</PageHeading>
      {switcher ?? (
        <p className="rounded-md border border-slate-300 bg-white p-4 text-slate-800">
          Sign-in is not set up for this environment. Ask your administrator for access.
        </p>
      )}
    </main>
  );
}

export function LoginPage() {
  return (
    <LoginView
      switcher={
        DevLoginSwitcher ? (
          <Suspense fallback={<LoadingState label="Loading sign-in options" />}>
            <DevLoginSwitcher demo={import.meta.env.VITE_DEMO === 'true'} />
          </Suspense>
        ) : null
      }
    />
  );
}
