import { useEffect, useRef } from 'react';
import { usePageTitle } from '../../lib/usePageTitle';

/**
 * The page's one h1. It sets the document title and, when focus was lost (a clicked button left the
 * page, as in sign-in and sign-out), takes focus so keyboard and screen-reader users land on the new page.
 */
export function PageHeading({ children }: { children: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  usePageTitle(children);
  useEffect(() => {
    if (document.activeElement === document.body || document.activeElement === null)
      ref.current?.focus();
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className="text-2xl font-semibold focus:outline-none">
      {children}
    </h1>
  );
}
