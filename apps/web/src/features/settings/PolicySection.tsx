import { useState } from 'react';
import type { Permission, RolePolicy } from '@ql/contracts';
import { ApiError } from '../../lib/api/client';
import { ErrorState, LoadingState, describeError } from '../../components/ui/states';
import { usePolicy, useSavePolicy } from './api';
import { POLICY_PERMISSIONS, POLICY_ROLES } from './messages';

type Roles = RolePolicy['roles'];
type EditableRole = (typeof POLICY_ROLES)[number]['id'];
const same = (a: Roles, b: Roles) =>
  POLICY_ROLES.every((r) => [...a[r.id]].sort().join() === [...b[r.id]].sort().join());

function Editor({ policy, onSaved }: { policy: RolePolicy; onSaved: (version: number) => void }) {
  const [roles, setRoles] = useState<Roles>(structuredClone(policy.roles));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const save = useSavePolicy();
  const dirty = !same(roles, policy.roles);

  const toggle = (role: EditableRole, permission: Permission, on: boolean) => {
    setMessage(null);
    setRoles((r) => ({
      ...r,
      [role]: on ? [...new Set([...r[role], permission])] : r[role].filter((p) => p !== permission),
    }));
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || save.isPending) return;
    save.mutate(roles, {
      onSuccess: (r) => {
        onSaved(r.policy.version);
      },
      onError: (err) =>
        setMessage({
          ok: false,
          text:
            err instanceof ApiError && err.status === 400
              ? "That combination isn't allowed, so nothing was saved."
              : err instanceof ApiError && err.status === 403
                ? "You don't have permission to change the policy."
                : `We couldn't save the policy. ${describeError(err)}`,
        }),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {message ? (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900">
          {message.text}
        </p>
      ) : null}
      <div
        role="region"
        aria-label="Role policy table"
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-slate-300 bg-white"
      >
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">What each role may do. Tick a box to allow it.</caption>
          <thead className="border-b border-slate-300 bg-slate-100">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold text-slate-900">
                Permission
              </th>
              {POLICY_ROLES.map((r) => (
                <th
                  key={r.id}
                  scope="col"
                  className="px-3 py-2 text-center font-semibold text-slate-900"
                >
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {POLICY_PERMISSIONS.map((p) => (
              <tr key={p.id} className="border-b border-slate-200 last:border-0">
                <th scope="row" className="px-3 py-2 text-left font-normal text-slate-900">
                  {p.label}
                </th>
                {POLICY_ROLES.map((r) => (
                  <td key={r.id} className="px-3 py-1 text-center">
                    <label className="inline-flex min-h-11 min-w-11 items-center justify-center">
                      <input
                        type="checkbox"
                        checked={roles[r.id].includes(p.id)}
                        onChange={(e) => toggle(r.id, p.id, e.target.checked)}
                        className="h-5 w-5"
                      />
                      <span className="sr-only">{`${r.label}: ${p.label}`}</span>
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-slate-800">
        Platform admins can only change this policy. That cannot be changed here, and no other role
        can ever hold it.
      </p>
      <p className="rounded-md border border-amber-400 bg-amber-50 p-3 text-amber-900">
        Changes apply to every company straight away. Each save is kept as a new version; older
        versions are never overwritten.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          aria-disabled={!dirty || save.isPending}
          className="inline-flex min-h-11 items-center rounded-md bg-blue-700 px-5 font-medium text-white hover:bg-blue-800 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
        >
          {save.isPending ? 'Saving…' : 'Save as a new version'}
        </button>
        <button
          type="button"
          aria-disabled={!dirty}
          onClick={() => {
            if (dirty) {
              setRoles(structuredClone(policy.roles));
              setMessage(null);
            }
          }}
          className="inline-flex min-h-11 items-center rounded-md border border-slate-500 bg-white px-4 font-medium text-slate-900 hover:bg-slate-100 aria-disabled:opacity-60"
        >
          Undo changes
        </button>
        {dirty ? <span className="text-slate-800">You have unsaved changes.</span> : null}
      </div>
    </form>
  );
}

export function PolicySection() {
  const q = usePolicy();
  const [saved, setSaved] = useState('');
  return (
    <section aria-labelledby="policy-title" className="space-y-4">
      <div>
        <h2 id="policy-title" className="text-xl font-semibold text-slate-900">
          Role policy
        </h2>
        <p className="text-slate-800">
          What each role may do for every company.
          {q.data ? ` Current version: ${q.data.policy.version}.` : ''}
        </p>
      </div>
      <p role="status" className="sr-only">
        {saved}
      </p>
      {saved ? (
        <p className="rounded-md border border-green-400 bg-green-50 p-3 font-medium text-green-900">
          {saved}
        </p>
      ) : null}
      {q.isPending ? (
        <LoadingState label="Loading the role policy" />
      ) : q.data === undefined ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        <Editor
          key={q.data.policy.version}
          policy={q.data.policy}
          onSaved={(v) => setSaved(`Saved as version ${v}. It applies straight away.`)}
        />
      )}
    </section>
  );
}
