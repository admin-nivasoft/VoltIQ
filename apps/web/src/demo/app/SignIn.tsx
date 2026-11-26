import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { InlineNotification } from '../../components/ui/inline-notification';
import { PRODUCT_NAME } from '../../lib/product';
import { MANUFACTURERS, USERS } from '../data';
import { ROLE_LABEL } from '../roles';
import { useSignIn } from './session';
import { ThemeToggle } from './Shell';

const ROLE_HINT = {
  battery_manager: 'Watches the batteries: health, warnings and data received.',
  admin: 'Everything the battery manager sees, plus importing factory data and managing the data connection.',
} as const;

/** The demo sign-in: pick a role at the one fictional manufacturer shown in the picker. */
export function SignIn() {
  const signIn = useSignIn();
  const navigate = useNavigate();
  const manufacturers = MANUFACTURERS.filter((m) => m.inPicker);

  return (
    <main id="main" className="min-h-[calc(100vh-44px)]">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:py-20">
        <div className="mb-4 flex justify-end">
          <ThemeToggle />
        </div>
        <p className="text-[13px] font-semibold text-cds-text-secondary">{PRODUCT_NAME}</p>
        <h1 className="mt-2 text-2xl font-semibold leading-8 tracking-[-0.01em]">Choose a demo user</h1>
        <p className="mt-3 max-w-prose text-cds-text-secondary">
          Every name, battery and number here is made up. Pick a role to see the platform as that
          person would.
        </p>
        {signIn.isError ? (
          <InlineNotification kind="error" title="Could not sign in" className="mt-6">
            Reload the page and try again.
          </InlineNotification>
        ) : null}
        {manufacturers.map((m) => (
          <fieldset key={m.id} className="mt-8">
            <legend className="text-xs font-medium leading-4 text-cds-text-secondary">
              {m.name} · battery manufacturer
            </legend>
            <ul className="mt-2 space-y-2">
              {USERS.filter((u) => u.manufacturerId === m.id).map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    disabled={signIn.isPending}
                    onClick={() => signIn.mutate(u.id, { onSuccess: () => navigate('/') })}
                    className="group flex w-full items-center gap-4 grad-tile rounded-lg px-4 py-3 text-left transition-shadow hover:shadow-[var(--cds-tile-shadow-hover)] disabled:opacity-60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{ROLE_LABEL[u.role]}</span>
                      <span className="block text-cds-text-secondary">{u.name}</span>
                      <span className="mt-1 block text-xs leading-4 text-cds-text-helper">{ROLE_HINT[u.role]}</span>
                    </span>
                    <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-cds-interactive" />
                  </button>
                </li>
              ))}
            </ul>
          </fieldset>
        ))}
      </div>
    </main>
  );
}
