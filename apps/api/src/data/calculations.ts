// Pure definitions from D-10. No database access, so every adapter (including future vendor
// adapters) shares exactly one definition of trend, near end of life and warranty status.
import type { WarrantyStatusSchema } from '@ql/contracts';
import type { z } from 'zod';

export interface Thresholds {
  nearEolMonths: number;
  trendDeclining: number;
  trendImproving: number;
  trendWindowDays: number;
  warrantyExpiringDays: number;
}

export type TrendDirection = 'declining' | 'stable' | 'improving' | 'insufficient_data';
export type WarrantyStatus = z.infer<typeof WarrantyStatusSchema>;

export interface Reading {
  /** Epoch milliseconds. */
  at: number;
  sohPct: number;
}

const DAY_MS = 86_400_000;
const MIN_READINGS = 3;

/**
 * Least-squares slope of SoH over the trend window, in points per 30 days (D-10).
 * Fewer than 3 readings in the window, or no spread in time, means "insufficient data".
 * Below trendDeclining is declining, above trendImproving is improving; the thresholds are strict.
 */
export function computeTrend(
  readings: readonly Reading[],
  now: number,
  t: Thresholds,
): { direction: TrendDirection; pointsPer30Days: number | null } {
  const from = now - t.trendWindowDays * DAY_MS;
  const r = readings.filter((x) => x.at >= from && x.at <= now);
  if (r.length < MIN_READINGS) return { direction: 'insufficient_data', pointsPer30Days: null };

  const n = r.length;
  const x0 = Math.min(...r.map((x) => x.at));
  const xs = r.map((x) => (x.at - x0) / DAY_MS);
  const ys = r.map((x) => x.sohPct);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] as number) - mx;
    sxx += dx * dx;
    sxy += dx * ((ys[i] as number) - my);
  }
  if (sxx === 0) return { direction: 'insufficient_data', pointsPer30Days: null };

  const slope = (sxy / sxx) * 30;
  const direction: TrendDirection =
    slope < t.trendDeclining ? 'declining' : slope > t.trendImproving ? 'improving' : 'stable';
  // Classification above uses the exact slope; only the reported figure is rounded.
  return { direction, pointsPer30Days: Math.round(slope * 100) / 100 || 0 };
}

/** Near end of life uses the conservative end of the remaining-life range (D-10). */
export function isNearEol(rulMonthsLow: number | null, t: Thresholds): boolean {
  return rulMonthsLow !== null && rulMonthsLow < t.nearEolMonths;
}

/**
 * The business day is the UTC calendar day. Active, Expiring (fewer than N days left, including today) or Expired (D-10). `expiresOn` is YYYY-MM-DD. */
export function warrantyStatus(expiresOn: string, today: Date, t: Thresholds): WarrantyStatus {
  // Fail loudly rather than open: a malformed date must never read as an active warranty.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn))
    throw new Error('warrantyStatus: expected YYYY-MM-DD');
  const end = Date.UTC(
    Number(expiresOn.slice(0, 4)),
    Number(expiresOn.slice(5, 7)) - 1,
    Number(expiresOn.slice(8, 10)),
  );
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const daysLeft = Math.round((end - now) / DAY_MS);
  if (daysLeft < 0) return 'expired';
  return daysLeft < t.warrantyExpiringDays ? 'expiring' : 'active';
}

/** Mean of each pack's latest SoH, to one decimal; null when there is nothing to average. */
export function averageSoh(latest: readonly number[]): number | null {
  if (latest.length === 0) return null;
  return Math.round((latest.reduce((a, b) => a + b, 0) / latest.length) * 10) / 10;
}
