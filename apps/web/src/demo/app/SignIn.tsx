import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { InlineNotification } from '../../components/ui/inline-notification';
import { PRODUCT_NAME } from '../../lib/product';
import { MANUFACTURERS, USERS } from '../data';
import { ROLE_LABEL } from '../roles';
import { useSignIn } from './session';

const ROLE_HINT = {
  battery_manager: 'Watches the fleet: health, warnings and data received.',
  admin: 'Everything the battery manager sees, plus importing factory data and managing the data connection.',
} as const;

/** The demo sign-in: pick a role at the one fictional manufacturer shown in the picker. */
export function SignIn() {
  const signIn = useSignIn();
  const navigate = useNavigate();
  const manufacturers = MANUFACTURERS.filter((m) => m.inPicker);

  return (
    <main id="main" className="min-h-[calc(100vh-44px)] bg-cds-layer">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:py-20">
        <p className="text-sm font-semibold text-cds-text-secondary">{PRODUCT_NAME}</p>
        <h1 className="mt-2 text-[28px] leading-9">Choose a demo user</h1>
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
            <legend className="text-xs font-semibold leading-4 tracking-[0.32px] text-cds-text-secondary">
              {m.name} · battery manufacturer
            </legend>
            <ul className="mt-2 space-y-px">
              {USERS.filter((u) => u.manufacturerId === m.id).map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    disabled={signIn.isPending}
                    onClick={() => signIn.mutate(u.id, { onSuccess: () => navigate('/') })}
                    className="group flex w-full items-center gap-4 bg-cds-layer-2 px-4 py-4 text-left hover:bg-cds-layer-hover disabled:opacity-60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{ROLE_LABEL[u.role]}</span>
                      <span className="block text-cds-text-secondary">{u.name}</span>
                      <span className="mt-1 block text-xs leading-4 text-cds-text-helper">{ROLE_HINT[u.role]}</span>
                    </span>
                    <ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0 text-cds-interactive" />
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
