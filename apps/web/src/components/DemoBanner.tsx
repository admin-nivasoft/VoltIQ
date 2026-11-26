import { FlaskConical, RotateCcw } from 'lucide-react';

/**
 * Shown on every page of a demo build (VITE_DEMO=true) and nowhere else. It says plainly that the
 * numbers are made up, so nobody mistakes a sales preview for live fleet data. Styled as a calm amber
 * bar. Colours fall back to literals so it looks right before the demo's theme has loaded.
 */
export function DemoBanner({ onReset }: { onReset: () => void }) {
  return (
    <aside aria-label="Demo notice" className="border-b border-[var(--cds-banner-border,#fde68a)] bg-[var(--cds-banner-bg,#fffbeb)] text-[var(--cds-banner-text,#78350f)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-[13px]">
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
          className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--cds-banner-border,#fde68a)] bg-transparent px-3 font-medium hover:bg-[var(--cds-banner-border,#fde68a)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          Reset demo
        </button>
      </div>
    </aside>
  );
}
