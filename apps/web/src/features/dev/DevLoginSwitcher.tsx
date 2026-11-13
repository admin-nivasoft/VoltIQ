import { useQueryClient } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { ME_KEY } from '../../lib/auth/session';
import { describeError } from '../../components/ui/states';
import { mockLogin } from './mockLogin';
import { DEMO_GROUP_NAME } from '../../demo/labels';
import { MOCK_USERS } from './mockUsers';

/**
 * Development login: included only when VITE_MOCK_AUTH=true at build time. In the stakeholder demo
 * (VITE_DEMO=true) the same picker is shown with friendlier wording and the demo companies' names.
 */
export default function DevLoginSwitcher({ demo = false }: { demo?: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const groups = [...new Set(MOCK_USERS.map((u) => u.group))];
  // Read behind the build flag, so the demo company names are in demo bundles only.
  const demoNames = import.meta.env.VITE_DEMO === 'true' ? DEMO_GROUP_NAME : {};

  async function signIn(userId: string) {
    setBusy(true);
    setError(null);
    try {
      await mockLogin(userId);
      await qc.invalidateQueries({ queryKey: ME_KEY });
      navigate('/');
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? 'Mock login is not available on this server. Start the API with AUTH_PROVIDER=mock and ENABLE_DEV_ENDPOINTS=true.'
          : describeError(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="dev-login-title"
      className={
        demo
          ? 'rounded-lg border-2 border-blue-700 bg-white p-4'
          : 'rounded-lg border-2 border-dashed border-amber-700 bg-amber-50 p-4'
      }
    >
      <h2
        id="dev-login-title"
        className={`flex items-center gap-2 text-lg font-semibold ${demo ? 'text-slate-900' : 'text-amber-900'}`}
      >
        <FlaskConical aria-hidden="true" className="h-5 w-5" />
        {demo ? 'Choose a demo user' : 'Development login'}
      </h2>
      <p className={demo ? 'mb-3 text-slate-800' : 'mb-3 text-sm text-amber-900'}>
        {demo
          ? 'Pick a person to see the portal as them. Each company only ever sees its own fleet, and each role sees different controls.'
          : 'Not for production. Pick a seeded user to see the portal as them.'}
      </p>
      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-red-900"
        >
          {error}
        </p>
      ) : null}
      {/* aria-disabled (not disabled) keeps keyboard focus on the button while a sign-in is in progress. */}
      <p role="status" className="mb-2 min-h-5 text-sm text-amber-900">
        {busy ? 'Signing in…' : ''}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((g) => (
          <fieldset
            key={g}
            className={`rounded-md border bg-white p-3 ${demo ? 'border-slate-400' : 'border-amber-300'}`}
          >
            <legend className="px-1 text-sm font-semibold text-slate-900">
              {demo ? (demoNames[g] ?? g) : g}
            </legend>
            <div className="flex flex-wrap gap-2">
              {MOCK_USERS.filter((u) => u.group === g).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  aria-disabled={busy}
                  onClick={() => {
                    if (!busy) void signIn(u.id);
                  }}
                  className="min-h-11 rounded-md bg-blue-700 px-3 font-medium text-white hover:bg-blue-800 aria-disabled:opacity-70"
                >
                  {u.label}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </section>
  );
}
