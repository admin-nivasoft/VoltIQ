import { expect, test as base } from '@playwright/test';

/** Every test starts from a fresh demo and fails if the page ever asks a server for anything. */
export const test = base.extend({
  page: async ({ page }, provide) => {
    const apiCalls: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.startsWith('/api/')) apiCalls.push(r.url());
    });
    await provide(page);
    expect(apiCalls, 'the demo must not call an API').toEqual([]);
  },
});
export { expect };
