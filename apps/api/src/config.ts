import { z } from 'zod';

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid configuration:\n- ${problems.join('\n- ')}`);
    this.name = 'ConfigError';
  }
}

/** Secrets that ship in examples and docs. A deployment that kept one would be forgeable. */
const KNOWN_PLACEHOLDER_SECRETS = ['dev-only-change-me-dev-only-change-me'];

const flag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');
const num = (def: number) => z.coerce.number().finite().default(def);
const notify = z.enum(['mock']).default('mock');

const EnvSchema = z.object({
  // Explicit on purpose: the production checks below must not be skippable by omission.
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // Explicit on purpose: there is no safe default (D-08).
  AUTH_PROVIDER: z.enum(['mock', 'entra']),
  ENABLE_DEV_ENDPOINTS: flag,
  JWT_SECRET: z.string().min(32),
  DATABASE_URL: z.string().min(1),
  DATA_PROVIDER: z.enum(['postgres-mock']).default('postgres-mock'),
  // Definitions (D-10): placeholders, all configurable.
  NEAR_EOL_MONTHS: num(6),
  TREND_DECLINING: num(-0.5),
  TREND_IMPROVING: num(0.5),
  TREND_WINDOW_DAYS: num(90),
  WARRANTY_EXPIRING_DAYS: num(90),
  NOTIFY_EMAIL: notify,
  NOTIFY_SMS: notify,
  NOTIFY_WEBHOOK: notify,
  // 'false', or the address/subnet of the reverse proxy whose X-Forwarded-For may be trusted.
  TRUST_PROXY: z.string().default('false'),
  RATE_LIMIT_PER_MINUTE: num(300),
  RATE_LIMIT_LOGIN_PER_MINUTE: num(10),
  PRODUCT_NAME: z.string().default('82V QualityLoop'),
});

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  authProvider: 'mock' | 'entra';
  /** True only when AUTH_PROVIDER=mock AND ENABLE_DEV_ENDPOINTS=true (D-08). */
  mockEnabled: boolean;
  jwtSecret: string;
  databaseUrl: string;
  dataProvider: 'postgres-mock';
  nearEolMonths: number;
  trendDeclining: number;
  trendImproving: number;
  trendWindowDays: number;
  warrantyExpiringDays: number;
  notify: { email: 'mock'; sms: 'mock'; webhook: 'mock' };
  trustProxy: boolean | string;
  rateLimitPerMinute: number;
  rateLimitLoginPerMinute: number;
  productName: string;
}

/** Parses the environment and refuses unsafe combinations. Messages never include secret values. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const e = parsed.data;
  const problems: string[] = [];
  if (e.NODE_ENV === 'production' && e.AUTH_PROVIDER === 'mock') {
    problems.push('AUTH_PROVIDER=mock is not allowed when NODE_ENV=production');
  }
  if (e.NODE_ENV === 'production' && e.ENABLE_DEV_ENDPOINTS) {
    problems.push('ENABLE_DEV_ENDPOINTS=true is not allowed when NODE_ENV=production');
  }
  if (e.TRUST_PROXY === 'true') {
    problems.push(
      'TRUST_PROXY must be "false" or the proxy address or subnet, never a blanket "true"',
    );
  }
  if (KNOWN_PLACEHOLDER_SECRETS.includes(e.JWT_SECRET)) {
    problems.push('JWT_SECRET is a published example value; generate your own');
  }
  if (problems.length) throw new ConfigError(problems);
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    authProvider: e.AUTH_PROVIDER,
    mockEnabled: e.AUTH_PROVIDER === 'mock' && e.ENABLE_DEV_ENDPOINTS,
    jwtSecret: e.JWT_SECRET,
    databaseUrl: e.DATABASE_URL,
    dataProvider: e.DATA_PROVIDER,
    nearEolMonths: e.NEAR_EOL_MONTHS,
    trendDeclining: e.TREND_DECLINING,
    trendImproving: e.TREND_IMPROVING,
    trendWindowDays: e.TREND_WINDOW_DAYS,
    warrantyExpiringDays: e.WARRANTY_EXPIRING_DAYS,
    notify: { email: e.NOTIFY_EMAIL, sms: e.NOTIFY_SMS, webhook: e.NOTIFY_WEBHOOK },
    trustProxy: e.TRUST_PROXY === 'false' ? false : e.TRUST_PROXY,
    rateLimitPerMinute: e.RATE_LIMIT_PER_MINUTE,
    rateLimitLoginPerMinute: e.RATE_LIMIT_LOGIN_PER_MINUTE,
    productName: e.PRODUCT_NAME,
  };
}
