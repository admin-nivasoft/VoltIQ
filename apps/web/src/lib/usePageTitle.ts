import { useEffect } from 'react';
import { PRODUCT_NAME } from './product';

/** Every page has its own document title (WCAG 2.4.2). */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · ${PRODUCT_NAME}`;
  }, [title]);
}
