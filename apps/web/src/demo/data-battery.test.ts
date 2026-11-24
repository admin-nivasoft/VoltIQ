// Demo data rule: a day never receives more messages than it expected (duplicates count once).
import { expect, it } from 'vitest';
import { BATTERY_COUNT, buildBatteries, MANUFACTURERS } from './data';
import { buildBatteryDetail } from './data-battery';
it('daily coverage never exceeds expected and sums to the totals', () => {
  const now = Date.now();
  for (const m of MANUFACTURERS)
    for (const b of buildBatteries(m, now, BATTERY_COUNT[m.id]!)) {
      const d = buildBatteryDetail(b, now).dailyCoverage;
      for (const x of d) expect(x.received).toBeLessThanOrEqual(x.expected);
      expect(d.reduce((a, x) => a + x.received, 0)).toBe(b.calc.received);
      expect(d.reduce((a, x) => a + x.expected, 0)).toBe(b.calc.expected);
    }
});
