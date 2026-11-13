import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.ts';

const base = {
  NODE_ENV: 'development',
  AUTH_PROVIDER: 'mock',
  ENABLE_DEV_ENDPOINTS: 'true',
  JWT_SECRET: 'k'.repeat(40),
  DATABASE_URL: 'postgres://ql_app:x@localhost:5442/qualityloop',
};
const withEnv = (o: Record<string, string | undefined>) => ({ ...base, ...o }) as NodeJS.ProcessEnv;

describe('startup config (D-08)', () => {
  it('accepts a valid mock dev config and applies defaults', () => {
    const c = loadConfig(withEnv({}));
    expect(c.mockEnabled).toBe(true);
    expect(c.nearEolMonths).toBe(6);
    expect(c.trendDeclining).toBe(-0.5);
    expect(c.rateLimitPerMinute).toBe(300);
    expect(c.rateLimitLoginPerMinute).toBe(10);
  });

  it.each([
    ['AUTH_PROVIDER=mock in production', { NODE_ENV: 'production' }],
    ['dev endpoints enabled in production', { NODE_ENV: 'production', AUTH_PROVIDER: 'entra' }],
    ['missing JWT_SECRET', { JWT_SECRET: undefined }],
    ['short JWT_SECRET', { JWT_SECRET: 'short' }],
    ['the published example secret', { JWT_SECRET: 'dev-only-change-me-dev-only-change-me' }],
    ['missing AUTH_PROVIDER', { AUTH_PROVIDER: undefined }],
    ['unknown AUTH_PROVIDER', { AUTH_PROVIDER: 'ldap' }],
    ['unset NODE_ENV', { NODE_ENV: undefined }],
    ['TRUST_PROXY=true', { TRUST_PROXY: 'true' }],
    [
      'mock email provider in production',
      {
        NODE_ENV: 'production',
        AUTH_PROVIDER: 'entra',
        NOTIFY_EMAIL: 'mock',
        NOTIFY_SMS: 'mock',
        NOTIFY_WEBHOOK: 'mock',
      },
    ],
    ['unknown DATA_PROVIDER', { DATA_PROVIDER: 'oracle' }],
    ['unknown notification provider', { NOTIFY_SMS: 'twilio' }],
    ['missing DATABASE_URL', { DATABASE_URL: undefined }],
    ['non-numeric threshold', { NEAR_EOL_MONTHS: 'soon' }],
  ])('refuses to start: %s', (_name, env) => {
    expect(() => loadConfig(withEnv(env))).toThrow(ConfigError);
  });

  it('mock features need BOTH flags', () => {
    expect(loadConfig(withEnv({ ENABLE_DEV_ENDPOINTS: 'false' })).mockEnabled).toBe(false);
    expect(loadConfig(withEnv({ ENABLE_DEV_ENDPOINTS: undefined })).mockEnabled).toBe(false);
  });

  it('AUTH_PROVIDER=entra never enables mock features, even with the dev flag', () => {
    expect(
      loadConfig(withEnv({ AUTH_PROVIDER: 'entra', ENABLE_DEV_ENDPOINTS: 'true' })).mockEnabled,
    ).toBe(false);
  });

  it('error messages never echo the secret', () => {
    expect(() => loadConfig(withEnv({ JWT_SECRET: 'tooshort-secret-value' }))).toThrow(ConfigError);
    try {
      loadConfig(withEnv({ JWT_SECRET: 'tooshort-secret-value' }));
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('tooshort-secret-value');
    }
    expect.hasAssertions();
  });
});
