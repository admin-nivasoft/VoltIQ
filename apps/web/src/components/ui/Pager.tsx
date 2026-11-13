import { ChevronLeft, ChevronRight } from 'lucide-react';

const btn =
  'inline-flex min-h-11 items-center gap-1 rounded-md border border-slate-500 bg-white px-3 font-medium text-slate-900 hover:bg-slate-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-60';

export function Pager({
  page,
  pageSize,
  total,
  onPage,
  noun,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  noun: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const go = (p: number) => () => {
    if (p >= 1 && p <= pages) onPage(p);
  };
  return (
    <nav aria-label={`${noun} pages`} className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" className={btn} aria-disabled={page <= 1} onClick={go(page - 1)}>
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        Previous<span className="sr-only"> page of {noun}</span>
      </button>
      <p className="text-slate-800">{`Page ${page} of ${pages}`}</p>
      <button type="button" className={btn} aria-disabled={page >= pages} onClick={go(page + 1)}>
        Next<span className="sr-only"> page of {noun}</span>
        <ChevronRight aria-hidden="true" className="h-4 w-4" />
      </button>
    </nav>
  );
}
