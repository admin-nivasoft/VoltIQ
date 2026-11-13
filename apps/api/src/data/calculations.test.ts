import { describe, expect, it } from 'vitest';
import {
  averageSoh,
  computeTrend,
  isNearEol,
  warrantyStatus,
  type Reading,
  type Thresholds,
} from './calculations.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 13, 12, 0, 0);
const T: Thresholds = {
  nearEolMonths: 6,
  trendDeclining: -0.5,
  trendImproving: 0.5,
  trendWindowDays: 90,
  warrantyExpiringDays: 90,
};

/** n readings, one every `step` days ending now, SoH moving `pointsPer30` per 30 days. */
const series = (n: number, start: number, pointsPer30: number, step = 3): Reading[] =>
  Array.from({ length: n }, (_, i) => ({
    at: NOW - (n - 1 - i) * step * DAY,
    sohPct: start + (pointsPer30 / 30) * i * step,
  }));

describe('computeTrend (D-10)', () => {
  it('needs at least 3 readings in the window', () => {
    expect(computeTrend([], NOW, T)).toEqual({
      direction: 'insufficient_data',
      pointsPer30Days: null,
    });
    expect(computeTrend(series(2, 90, -3), NOW, T).direction).toBe('insufficient_data');
    expect(computeTrend(series(3, 90, -3), NOW, T).direction).toBe('declining');
  });

  it('counts only readings inside the window', () => {
    const old = series(10, 90, -3).map((r) => ({ ...r, at: r.at - 200 * DAY }));
    expect(computeTrend(old, NOW, T).direction).toBe('insufficient_data');
    const mixed = [...old, ...series(2, 90, -3)];
    expect(computeTrend(mixed, NOW, T).direction).toBe('insufficient_data');
  });

  it('flat data is stable with a slope of 0', () => {
    expect(computeTrend(series(20, 92, 0), NOW, T)).toEqual({
      direction: 'stable',
      pointsPer30Days: 0,
    });
  });

  it('classifies declining and improving, and reports points per 30 days', () => {
    const d = computeTrend(series(20, 95, -1.6), NOW, T);
    expect(d.direction).toBe('declining');
    expect(d.pointsPer30Days).toBeCloseTo(-1.6, 2);
    const i = computeTrend(series(20, 85, 0.8), NOW, T);
    expect(i.direction).toBe('improving');
    expect(i.pointsPer30Days).toBeCloseTo(0.8, 2);
  });

  it('a slope exactly at a threshold is stable (below / above are strict)', () => {
    // Three daily readings falling 0.5 a day: the slope is exactly -15 points per 30 days.
    const at = (i: number) => NOW - (2 - i) * DAY;
    const down: Reading[] = [90, 89.5, 89].map((sohPct, i) => ({ at: at(i), sohPct }));
    const up: Reading[] = [89, 89.5, 90].map((sohPct, i) => ({ at: at(i), sohPct }));
    expect(computeTrend(down, NOW, { ...T, trendDeclining: -15 }).direction).toBe('stable');
    expect(computeTrend(down, NOW, { ...T, trendDeclining: -14.99 }).direction).toBe('declining');
    expect(computeTrend(up, NOW, { ...T, trendImproving: 15 }).direction).toBe('stable');
    expect(computeTrend(up, NOW, { ...T, trendImproving: 14.99 }).direction).toBe('improving');
    expect(computeTrend(series(20, 90, -0.6), NOW, T).direction).toBe('declining');
    expect(computeTrend(series(20, 90, 0.6), NOW, T).direction).toBe('improving');
  });

  it('thresholds come from config, not the logic', () => {
    const s = series(20, 90, -0.4);
    expect(computeTrend(s, NOW, T).direction).toBe('stable');
    expect(computeTrend(s, NOW, { ...T, trendDeclining: -0.2 }).direction).toBe('declining');
  });

  it('is independent of input order', () => {
    const s = series(20, 95, -1.6);
    expect(computeTrend([...s].reverse(), NOW, T)).toEqual(computeTrend(s, NOW, T));
  });

  it('readings all at one instant carry no trend', () => {
    const same = Array.from({ length: 5 }, (_, i) => ({ at: NOW - DAY, sohPct: 90 - i }));
    expect(computeTrend(same, NOW, T).direction).toBe('insufficient_data');
  });

  it('ignores readings from the future', () => {
    const s = [...series(2, 90, 0), { at: NOW + DAY, sohPct: 50 }];
    expect(computeTrend(s, NOW, T).direction).toBe('insufficient_data');
  });
});

describe('isNearEol (D-10)', () => {
  it('uses the conservative end of the range and a strict threshold', () => {
    expect(isNearEol(5.9, T)).toBe(true);
    expect(isNearEol(6, T)).toBe(false);
    expect(isNearEol(0, T)).toBe(true);
    expect(isNearEol(null, T)).toBe(false);
    expect(isNearEol(11.9, { ...T, nearEolMonths: 12 })).toBe(true);
  });
});

describe('warrantyStatus (D-10)', () => {
  const today = new Date(NOW);
  const on = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString().slice(0, 10);
  it('expired in the past; expiring under 90 days (including today); otherwise active', () => {
    expect(warrantyStatus(on(-1), today, T)).toBe('expired');
    expect(warrantyStatus(on(0), today, T)).toBe('expiring');
    expect(warrantyStatus(on(89), today, T)).toBe('expiring');
    expect(warrantyStatus(on(90), today, T)).toBe('active');
    expect(warrantyStatus(on(400), today, T)).toBe('active');
  });
  it('the Expiring window is configurable', () => {
    expect(warrantyStatus(on(100), today, { ...T, warrantyExpiringDays: 120 })).toBe('expiring');
  });
});

describe('averageSoh (D-10)', () => {
  it('is null with nothing to average', () => expect(averageSoh([])).toBeNull());
  it('rounds the mean to one decimal', () => {
    expect(averageSoh([90, 91])).toBe(90.5);
    expect(averageSoh([90, 90, 91])).toBe(90.3);
    expect(averageSoh([88.04])).toBe(88);
  });
});
