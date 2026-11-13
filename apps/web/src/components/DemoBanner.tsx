import { FlaskConical, RotateCcw } from 'lucide-react';

/**
 * Shown on every page of a demo build (VITE_DEMO=true) and nowhere else. It says plainly that the
 * numbers are made up, so nobody mistakes a stakeholder preview for live fleet data.
 */
export function DemoBanner({ onReset }: { onReset: () => void }) {
  return (
    <aside
      aria-label="Demo notice"
      className="border-b border-amber-700 bg-amber-300 text-slate-900"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
        <p className="flex items-center gap-2 font-semibold">
          <FlaskConical aria-hidden="true" className="h-5 w-5 shrink-0" />
          DEMO
        </p>
        <p className="min-w-0 flex-1">
          Sample data only: a clickable prototype that runs in your browser. Nothing is saved, and
          nothing here is real fleet data.
        </p>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-900 bg-white px-3 font-medium hover:bg-slate-100"
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          Reset demo
        </button>
      </div>
    </aside>
  );
}
