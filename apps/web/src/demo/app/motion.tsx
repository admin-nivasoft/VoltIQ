// Motion setup for the demo: one provider (lazy features, strict so only `m.*` is allowed) and the
// shared variants. Everything here is short (<= 220ms), runs on mount or change only, never loops,
// and is switched off by the browser's reduced-motion setting (MotionConfig reducedMotion="user").
import { domAnimation, LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Parent: staggers children 40ms apart on first mount. */
export const staggerParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

/** Child: fade up, 200ms. */
export const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE_OUT } },
};

/** Hover lift for cards that are links. */
export const lift = { y: -2, boxShadow: 'var(--cds-tile-shadow-hover)' };
