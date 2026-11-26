import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { m } from 'motion/react';
import { EASE_OUT } from '../motion';

export interface TabDef {
  id: string;
  label: string;
  count?: number;
  panel: ReactNode;
}

/** WAI-ARIA tabs, automatic activation. Only the selected panel is rendered. */
export function Tabs({
  tabs,
  selected,
  onSelect,
  label,
}: {
  tabs: TabDef[];
  selected: string;
  onSelect: (id: string) => void;
  label: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const current = tabs.find((t) => t.id === selected) ?? tabs[0]!;

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = tabs.length - 1;
    if (n < 0) return;
    e.preventDefault();
    const t = tabs[n]!;
    onSelect(t.id);
    refs.current[t.id]?.focus();
  };

  return (
    <div>
      {/* Scrolls sideways on a phone without showing a scroll bar; overflow-y-hidden stops the 1px
          underline overlap from making a vertical bar. Arrow keys move focus, which scrolls the tab into view. */}
      <div className="mb-6 overflow-x-auto overflow-y-hidden border-b border-cds-border-subtle [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div role="tablist" aria-label={label} className="flex min-w-max">
          {tabs.map((t, i) => {
            const on = t.id === current.id;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  refs.current[t.id] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={on}
                aria-controls={`panel-${t.id}`}
                tabIndex={on ? 0 : -1}
                onClick={() => onSelect(t.id)}
                onKeyDown={(e) => onKey(e, i)}
                className={`relative -mb-px min-h-12 whitespace-nowrap px-4 text-sm hover:bg-cds-layer-hover ${
                  on ? 'font-semibold' : ''
                }`}
              >
                {on ? (
                  <m.span
                    aria-hidden="true"
                    layoutId="tab-underline"
                    transition={{ duration: 0.22, ease: EASE_OUT }}
                    className="absolute inset-x-0 bottom-0 h-1 rounded-t bg-gradient-to-r from-cds-interactive to-[#0ea5e9]"
                  />
                ) : null}
                {t.label}
                {t.count !== undefined ? <span className="tnum"> ({t.count})</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      <m.div
        key={current.id}
        role="tabpanel"
        id={`panel-${current.id}`}
        aria-labelledby={`tab-${current.id}`}
        tabIndex={0}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: EASE_OUT }}
      >
        {current.panel}
      </m.div>
    </div>
  );
}
