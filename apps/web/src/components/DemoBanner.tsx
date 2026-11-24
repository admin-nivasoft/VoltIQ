import { FlaskConical, RotateCcw } from 'lucide-react';

/**
 * Shown on every page of a demo build (VITE_DEMO=true) and nowhere else. It says plainly that the
 * numbers are made up, so nobody mistakes a sales preview for live fleet data. Styled as a Carbon
 * warning strip; colours are literal so it looks right before the demo's theme has loaded.
 */
export function DemoBanner({ onReset }: { onReset: () => void }) {
  return (
    <aside aria-label="Demo notice" className="border-b border-[#8e6a00] bg-[#f1c21b] text-[#161616]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-sm">
        <p className="flex items-center gap-2 font-semibold">
          <FlaskConical aria-hidden="true" className="h-4 w-4 shrink-0" />
          DEMO
        </p>
        <p className="min-w-0 flex-1">
          <span className="sm:hidden">Sample data only. Nothing is saved.</span>
          <span className="hidden sm:inline">
            Sample data only: a fictional manufacturer, in your browser. Nothing is saved, and nothing
            here is real battery data.
          </span>
        </p>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-8 items-center gap-2 border border-[#161616] bg-white px-3 font-semibold hover:bg-[#f4f4f4] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0f62fe]"
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          Reset demo
        </button>
      </div>
    </aside>
  );
}
