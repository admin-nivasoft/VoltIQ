const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "2 min ago", "5 h ago", "3 days ago". */
export function ago(iso: string, now = Date.now()): string {
  const d = Math.max(0, now - Date.parse(iso));
  if (d < MIN) return 'just now';
  if (d < HOUR) return `${Math.floor(d / MIN)} min ago`;
  if (d < 2 * DAY) return `${Math.floor(d / HOUR)} h ago`;
  return `${Math.floor(d / DAY)} days ago`;
}

/** "23 Nov 2026, 14:02" in the viewer's time zone. */
export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function date(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const num = (n: number, digits = 0) =>
  n.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
