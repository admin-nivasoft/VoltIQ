import { CheckCircle2, XCircle } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import {
  NotificationChannelInputSchema,
  type ChannelType,
  type NotificationChannel,
} from '@ql/contracts';
import { ApiError } from '../../lib/api/client';
import { ErrorState, LoadingState, describeError } from '../../components/ui/states';
import { useChannels, useSaveChannels, useTestChannel, type ChannelInput } from './api';
import { CHANNEL_LABEL, TARGET_ERROR, TARGET_HINT, describeDeliveryError } from './messages';

const TYPES: ChannelType[] = ['email', 'sms', 'webhook'];
interface Row {
  enabled: boolean;
  target: string;
}
type Rows = Record<ChannelType, Row>;
type TestResult = { status: 'sent' | 'failed'; text: string } | { status: 'error'; text: string };

const toRows = (saved: NotificationChannel[]): Rows =>
  Object.fromEntries(
    TYPES.map((t) => {
      const c = saved.find((x) => x.type === t);
      return [t, { enabled: c?.enabled ?? true, target: c?.target ?? '' }];
    }),
  ) as Rows;

const clean = (r: Row): Row => ({ enabled: r.enabled, target: r.target.trim() });
const same = (a: Rows, b: Rows) =>
  TYPES.every((t) => a[t].enabled === b[t].enabled && a[t].target.trim() === b[t].target.trim());

function check(type: ChannelType, row: Row): string | null {
  const target = row.target.trim();
  if (!target) return null; // an empty row simply means "no channel of this kind"
  return NotificationChannelInputSchema.safeParse({ type, target, enabled: row.enabled }).success
    ? null
    : TARGET_ERROR[type];
}

function Form({ saved, onSaved }: { saved: NotificationChannel[]; onSaved: () => void }) {
  const baseline = toRows(saved);
  const [rows, setRows] = useState<Rows>(baseline);
  const [errors, setErrors] = useState<Partial<Record<ChannelType, string>>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [results, setResults] = useState<Partial<Record<ChannelType, TestResult>>>({});
  const refs = useRef<Partial<Record<ChannelType, HTMLInputElement | null>>>({});
  const save = useSaveChannels();
  const test = useTestChannel();
  const [testing, setTesting] = useState<ChannelType | null>(null);
  const dirty = !same(rows, baseline);
  const uid = useId();

  const edit = (t: ChannelType, patch: Partial<Row>) => {
    setRows((r) => ({ ...r, [t]: { ...r[t], ...patch } }));
    setErrors((e) => ({ ...e, [t]: undefined }));
    setResults((r) => ({ ...r, [t]: undefined }));
    setSummary(null);
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = Object.fromEntries(
      TYPES.flatMap((t) => {
        const m = check(t, rows[t]);
        return m ? [[t, m]] : [];
      }),
    ) as Partial<Record<ChannelType, string>>;
    setErrors(found);
    const bad = TYPES.filter((t) => found[t]);
    if (bad.length) {
      setSummary(
        `${bad.length === 1 ? 'There is 1 problem' : `There are ${bad.length} problems`} to fix before saving.`,
      );
      refs.current[bad[0]!]?.focus();
      return;
    }
    setSummary(null);
    const channels: ChannelInput[] = TYPES.flatMap((t) =>
      rows[t].target.trim() ? [{ type: t, ...clean(rows[t]) }] : [],
    );
    save.mutate(channels, {
      onSuccess: onSaved,
      onError: (err) => setSummary(`We couldn't save your channels. ${describeError(err)}`),
    });
  }

  function sendTest(t: ChannelType) {
    setTesting(t);
    test.mutate(t, {
      onSuccess: (r) =>
        setResults((x) => ({
          ...x,
          [t]:
            r.status === 'sent'
              ? { status: 'sent', text: `Test message sent to ${CHANNEL_LABEL[t]}.` }
              : {
                  status: 'failed',
                  text: `Test message to ${CHANNEL_LABEL[t]} failed. ${describeDeliveryError(r.error)}`,
                },
        })),
      onError: (err) =>
        setResults((x) => ({
          ...x,
          [t]: {
            status: 'error',
            text:
              err instanceof ApiError && err.status === 404
                ? 'Save this channel first, then send a test.'
                : `We couldn't send the test. ${describeError(err)}`,
          },
        })),
      onSettled: () => setTesting(null),
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {summary ? (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900">
          {summary}
        </p>
      ) : null}
      {TYPES.map((t) => {
        const id = `${uid}-${t}`;
        const err = errors[t];
        const result = results[t];
        const target = rows[t].target.trim();
        const canTest = !!target && !dirty && !check(t, rows[t]);
        const why = !target ? 'Enter an address first.' : dirty ? 'Save your changes first.' : '';
        return (
          <fieldset key={t} className="space-y-3 rounded-lg border border-slate-400 bg-white p-4">
            <legend className="px-1 text-lg font-semibold text-slate-900">
              {CHANNEL_LABEL[t]}
            </legend>
            <div>
              <label htmlFor={id} className="mb-1 block font-medium text-slate-900">
                {t === 'email'
                  ? 'Email address'
                  : t === 'sms'
                    ? 'Mobile number'
                    : 'Webhook address'}
              </label>
              <input
                id={id}
                ref={(el) => {
                  refs.current[t] = el;
                }}
                type="text"
                inputMode={t === 'sms' ? 'tel' : t === 'email' ? 'email' : 'url'}
                autoComplete="off"
                value={rows[t].target}
                maxLength={2048}
                aria-invalid={err ? true : undefined}
                aria-describedby={`${id}-hint${err ? ` ${id}-err` : ''}`}
                onChange={(e) => edit(t, { target: e.target.value })}
                className={`min-h-11 w-full rounded-md border bg-white px-3 text-slate-900 ${err ? 'border-red-700' : 'border-slate-500'}`}
              />
              <p id={`${id}-hint`} className="mt-1 text-sm text-slate-700">
                {TARGET_HINT[t]}
              </p>
              {err ? (
                <p
                  id={`${id}-err`}
                  className="mt-1 flex items-center gap-1.5 text-sm font-medium text-red-900"
                >
                  <XCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
                  {err}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex min-h-11 items-center gap-2 text-slate-900">
                <input
                  type="checkbox"
                  checked={rows[t].enabled}
                  onChange={(e) => edit(t, { enabled: e.target.checked })}
                  className="h-5 w-5"
                />
                Send alerts to this channel
              </label>
              <button
                type="button"
                aria-disabled={!canTest || testing !== null}
                aria-describedby={why ? `${id}-why` : undefined}
                onClick={() => {
                  if (canTest && testing === null) sendTest(t);
                }}
                className="inline-flex min-h-11 items-center rounded-md border border-slate-500 bg-white px-4 font-medium text-slate-900 hover:bg-slate-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
              >
                {testing === t ? 'Sending…' : 'Send test message'}
                <span className="sr-only">{` to ${CHANNEL_LABEL[t]}`}</span>
              </button>
              {why ? (
                <span id={`${id}-why`} className="text-sm text-slate-700">
                  {why}
                </span>
              ) : null}
            </div>
            <p
              role="status"
              className={
                result
                  ? 'flex items-start gap-1.5 font-medium ' +
                    (result.status === 'sent' ? 'text-green-900' : 'text-red-900')
                  : 'sr-only'
              }
            >
              {result ? (
                <>
                  {result.status === 'sent' ? (
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
                  ) : (
                    <XCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
                  )}
                  {result.text}
                </>
              ) : null}
            </p>
          </fieldset>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          aria-disabled={save.isPending}
          className="inline-flex min-h-11 items-center rounded-md bg-blue-700 px-5 font-medium text-white hover:bg-blue-800 aria-disabled:opacity-70"
        >
          {save.isPending ? 'Saving…' : 'Save channels'}
        </button>
        {dirty ? <span className="text-slate-800">You have unsaved changes.</span> : null}
      </div>
    </form>
  );
}

export function ChannelsSection() {
  const q = useChannels();
  // Kept here, outside the form that remounts after a save, so the announcement is not lost.
  const [saved, setSaved] = useState('');
  return (
    <section aria-labelledby="channels-title" className="space-y-4">
      <div>
        <h2 id="channels-title" className="text-xl font-semibold text-slate-900">
          My notification channels
        </h2>
        <p className="text-slate-800">
          Where we send you alerts. Leave a box empty if you do not want that kind of message.
        </p>
      </div>
      <p role="status" className="sr-only">
        {saved}
      </p>
      {q.isPending ? (
        <LoadingState label="Loading your channels" />
      ) : q.data === undefined ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        // A new key after each save resets the form to what the server now holds.
        <Form
          key={JSON.stringify(q.data)}
          saved={q.data}
          onSaved={() => setSaved(`Channels saved (${new Date().toLocaleTimeString()}).`)}
        />
      )}
    </section>
  );
}
