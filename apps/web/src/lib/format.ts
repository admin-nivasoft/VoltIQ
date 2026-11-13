const time = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export const formatTime = (ms: number | Date): string => time.format(ms);
export const formatDateTime = (iso: string): string => dateTime.format(new Date(iso));
export const formatPercent = (n: number | null): string => (n === null ? '—' : `${n.toFixed(1)}%`);

/** "8–12 months", or "8 months" when the range is a single value. */
export function formatMonthsRange(low: number, high: number): string {
  const f = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const unit = high === 1 ? 'month' : 'months';
  return low === high ? `${f(low)} ${unit}` : `${f(low)}–${f(high)} ${unit}`;
}
