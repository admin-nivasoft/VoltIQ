import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AlertStatusBadge, SeverityBadge, TrendBadge, WarrantyBadge } from './badges';

// Status must never rely on colour alone: each badge has visible words and a hidden decorative icon.
function expectWordsAndIcon(container: HTMLElement, text: string) {
  expect(screen.getByText(text)).toBeInTheDocument();
  const svg = container.querySelector('svg');
  expect(svg, text).not.toBeNull();
  expect(svg).toHaveAttribute('aria-hidden', 'true');
}

describe('badges', () => {
  it.each(['high', 'medium', 'low'] as const)('severity %s', (s) => {
    const { container } = render(<SeverityBadge severity={s} />);
    expectWordsAndIcon(container, `${s[0]!.toUpperCase()}${s.slice(1)} severity`);
  });
  it.each([
    ['open', 'Open'],
    ['acknowledged', 'Acknowledged'],
    ['resolved', 'Resolved'],
  ] as const)('alert status %s', (s, t) => {
    const { container } = render(<AlertStatusBadge status={s} />);
    expectWordsAndIcon(container, t);
  });
  it.each([
    ['active', 'Warranty active'],
    ['expiring', 'Warranty expiring'],
    ['expired', 'Warranty expired'],
  ] as const)('warranty %s', (s, t) => {
    const { container } = render(<WarrantyBadge status={s} />);
    expectWordsAndIcon(container, t);
  });
  it.each([
    ['declining', 'Declining'],
    ['stable', 'Stable'],
    ['improving', 'Improving'],
    ['insufficient_data', 'Not enough data'],
  ] as const)('trend %s', (d, t) => {
    const { container } = render(<TrendBadge trend={{ direction: d, pointsPer30Days: null }} />);
    expectWordsAndIcon(container, t);
  });
  it('the slope is signed, in points per 30 days, and absent when unknown', () => {
    const { rerender } = render(
      <TrendBadge trend={{ direction: 'declining', pointsPer30Days: -1.64 }} />,
    );
    expect(screen.getByText('−1.6 pts / 30 days')).toBeInTheDocument();
    rerender(<TrendBadge trend={{ direction: 'improving', pointsPer30Days: 0.8 }} />);
    expect(screen.getByText('+0.8 pts / 30 days')).toBeInTheDocument();
    rerender(<TrendBadge trend={{ direction: 'stable', pointsPer30Days: -0.04 }} />);
    expect(screen.getByText('0.0 pts / 30 days')).toBeInTheDocument(); // no "−0.0"
    rerender(<TrendBadge trend={{ direction: 'stable', pointsPer30Days: 0.04 }} />);
    expect(screen.getByText('0.0 pts / 30 days')).toBeInTheDocument();
    rerender(<TrendBadge trend={{ direction: 'stable', pointsPer30Days: 0 }} />);
    expect(screen.getByText('0.0 pts / 30 days')).toBeInTheDocument();
    rerender(<TrendBadge trend={{ direction: 'insufficient_data', pointsPer30Days: null }} />);
    expect(screen.queryByText(/pts/)).not.toBeInTheDocument();
  });
});
