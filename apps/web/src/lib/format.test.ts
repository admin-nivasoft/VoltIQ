import { describe, expect, it } from 'vitest';
import { formatMonthsRange, formatPercent } from './format';

describe('format', () => {
  it('formats a months range, singular when the top of the range is 1', () => {
    expect(formatMonthsRange(8, 12)).toBe('8–12 months');
    expect(formatMonthsRange(8, 8)).toBe('8 months');
    expect(formatMonthsRange(0, 1)).toBe('0–1 month');
    expect(formatMonthsRange(1, 1)).toBe('1 month');
    expect(formatMonthsRange(2.5, 5)).toBe('2.5–5 months');
  });
  it('formats a percentage to one decimal, or a dash', () => {
    expect(formatPercent(91.84)).toBe('91.8%');
    expect(formatPercent(null)).toBe('—');
  });
});
