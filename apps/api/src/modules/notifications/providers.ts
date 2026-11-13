import type { ChannelType } from '@ql/contracts';
import { ConfigError, type Config } from '../../config.ts';

export interface NotificationMessage {
  target: string;
  subject: string;
  body: string;
  kind: 'alert' | 'test';
}

export interface DeliveryResult {
  ok: boolean;
  /** A short fixed code. Never provider internals, URLs or credentials. */
  error: string | null;
}

/** One interface for email, SMS and webhook. A real service later is a new class and a config value. */
export interface NotificationProvider {
  channel: ChannelType;
  /**
   * `signal` is aborted when the worker gives up on this send (timeout). A real provider must stop
   * the request when it fires (e.g. pass it to fetch), or the user may get the message twice.
   */
  send(msg: NotificationMessage, opts?: { signal?: AbortSignal }): Promise<DeliveryResult>;
}

export type ProviderRegistry = Record<ChannelType, NotificationProvider>;

const ERROR_CODES = [
  'mock_delivery_failed',
  'provider_error',
  'delivery_failed',
  'delivery_timeout',
  'channel_disabled',
] as const;

/**
 * What reaches notification_log.error and the Settings screen (shown to consumer_admin).
 * Anything that is not already a known code collapses to a generic one.
 */
export function sanitizeError(e: unknown): (typeof ERROR_CODES)[number] {
  if (typeof e === 'string')
    return (ERROR_CODES as readonly string[]).includes(e)
      ? (e as (typeof ERROR_CODES)[number])
      : 'delivery_failed';
  if (e instanceof Error) return 'provider_error';
  return 'delivery_failed';
}

/** A canned result after a short delay. A target containing "fail" always fails (plan: failure path). */
export function createMockProvider(
  channel: ChannelType,
  opts: { delayMs?: number } = {},
): NotificationProvider {
  const delayMs = opts.delayMs ?? 20;
  return {
    channel,
    async send(msg, opts) {
      const signal = opts?.signal;
      if (delayMs > 0) {
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, delayMs);
          signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(t);
              resolve();
            },
            { once: true },
          );
        });
      }
      // An aborted send is never "delivered".
      if (signal?.aborted) return { ok: false, error: 'delivery_timeout' };
      return msg.target.toLowerCase().includes('fail')
        ? { ok: false, error: 'mock_delivery_failed' }
        : { ok: true, error: null };
    },
  };
}

type Factory = (channel: ChannelType, opts: { delayMs?: number }) => NotificationProvider;
const FACTORIES: Record<string, Factory> = { mock: createMockProvider };

/** Chooses a provider per channel from config. An unknown value fails at startup. */
export function createProviderRegistry(
  notify: Config['notify'],
  opts: { delayMs?: number } = {},
): ProviderRegistry {
  const build = (channel: ChannelType, name: string): NotificationProvider => {
    const factory = FACTORIES[name];
    if (!factory)
      throw new ConfigError([`NOTIFY_${channel.toUpperCase()}: unknown provider "${name}"`]);
    return factory(channel, opts);
  };
  return {
    email: build('email', notify.email),
    sms: build('sms', notify.sms),
    webhook: build('webhook', notify.webhook),
  };
}
