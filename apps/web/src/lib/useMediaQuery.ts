import { useSyncExternalStore } from 'react';

/** Tracks a CSS media query. Used to swap the pack table for cards below 768 px (D-14). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', notify);
      return () => m.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}
