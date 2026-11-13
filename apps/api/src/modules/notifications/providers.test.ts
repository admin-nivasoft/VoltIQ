import { describe, expect, it } from 'vitest';
import { ConfigError } from '../../config.ts';
import { createMockProvider, createProviderRegistry, sanitizeError } from './providers.ts';

const msg = (target: string) => ({ target, subject: 's', body: 'b', kind: 'alert' as const });

describe('mock providers', () => {
  it.each(['email', 'sms', 'webhook'] as const)(
    '%s succeeds for a normal target',
    async (channel) => {
      const p = createMockProvider(channel, { delayMs: 0 });
      expect(p.channel).toBe(channel);
      expect(await p.send(msg('someone@example.test'))).toEqual({ ok: true, error: null });
    },
  );

  it.each([
    'fail@example.test',
    'FAIL@example.test',
    '+91fail',
    'https://hooks.example.test/Fail/x',
  ])('a target containing "fail" always fails: %s', async (target) => {
    const r = await createMockProvider('email', { delayMs: 0 }).send(msg(target));
    expect(r).toEqual({ ok: false, error: 'mock_delivery_failed' });
  });

  it('waits for a short simulated delay', async () => {
    const t0 = Date.now();
    await createMockProvider('sms', { delayMs: 30 }).send(msg('+919800000000'));
    expect(Date.now() - t0).toBeGreaterThanOrEqual(25);
  });
});

describe('provider registry', () => {
  it('builds one provider per channel from config', () => {
    const r = createProviderRegistry(
      { email: 'mock', sms: 'mock', webhook: 'mock' },
      { delayMs: 0 },
    );
    expect(Object.keys(r).sort()).toEqual(['email', 'sms', 'webhook']);
    expect(r.sms.channel).toBe('sms');
  });

  it('fails at startup on an unknown provider instead of dropping alerts silently', () => {
    expect(() =>
      createProviderRegistry({ email: 'mock', sms: 'twilio', webhook: 'mock' } as never),
    ).toThrow(ConfigError);
  });
});

describe('sanitizeError', () => {
  it('reduces anything to a short fixed code, never provider internals or URLs', () => {
    expect(sanitizeError('mock_delivery_failed')).toBe('mock_delivery_failed');
    expect(sanitizeError('connect ECONNREFUSED https://secret.example/hook?token=abc')).toBe(
      'delivery_failed',
    );
    expect(sanitizeError(null)).toBe('delivery_failed');
    expect(sanitizeError('delivery_timeout')).toBe('delivery_timeout');
    expect(sanitizeError('channel_disabled')).toBe('channel_disabled');
    expect(sanitizeError(new Error('boom'))).toBe('provider_error');
  });
});
