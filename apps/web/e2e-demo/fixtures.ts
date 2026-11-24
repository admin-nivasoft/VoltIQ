import AxeBuilder from '@axe-core/playwright';
import { expect, test as base, type Page } from '@playwright/test';

/**
 * Every test starts from a fresh demo (a new browser context has empty session storage) and fails if
 * the page ever asks a server for anything under /api/.
 */
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

export const WIDTHS = [390, 768, 1440] as const;

export type DemoRole = 'Battery manager' | 'Admin';

/** Signs in from the demo sign-in screen and waits for the fleet overview to finish loading. */
export async function signIn(page: Page, role: DemoRole, visit = true) {
  if (visit) await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Choose a demo user' })).toBeVisible();
  await page
    .getByRole('group', { name: 'Lumen Ridge Batteries · battery manufacturer' })
    .getByRole('button', { name: new RegExp(`^${role}`) })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Fleet overview' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'All batteries' })).toBeVisible();
}

export type Screen = 'Fleet overview' | 'Factory data import' | 'Data connection';
const LOADED: Record<Screen, string> = {
  'Fleet overview': 'All batteries',
  'Factory data import': 'Import history',
  'Data connection': 'Connectors',
};

/** Goes to a screen with the main navigation: the side nav when it shows, otherwise the menu sheet. */
export async function goTo(page: Page, screen: Screen) {
  const link = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: screen });
  if (!(await link.isVisible())) {
    await page.getByRole('button', { name: 'Open menu' }).click();
  }
  await link.click();
  await expect(page.getByRole('heading', { level: 1, name: screen })).toBeVisible();
  await expect(page.getByRole('heading', { name: LOADED[screen] })).toBeVisible();
}

/** Opens the first battery in the fleet table or card list. Returns its factory serial. */
export async function openFirstBattery(page: Page): Promise<string> {
  const link = page.getByRole('link', { name: /^LRB-\d{4}-\d{5}$/ }).first();
  const serial = (await link.textContent())!.trim();
  await link.click();
  await expect(page.getByRole('heading', { level: 1, name: serial })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Battery data' })).toBeVisible();
  return serial;
}

/** WCAG 2.1 A and AA, every impact level. Returns a readable list so a failure says what and where. */
export async function axeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return violations.map(
    (v) => `${v.impact}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`,
  );
}

/** True when the page itself scrolls sideways. Tables inside their own scroll box do not count. */
export const scrollsSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

/** The count shown for one "Needs attention" item, or null when that item is not listed. */
export async function attentionCount(page: Page, text: RegExp): Promise<number | null> {
  const item = page
    .getByRole('region', { name: 'Needs attention' })
    .getByRole('link')
    .filter({ hasText: text });
  if ((await item.count()) === 0) return null;
  const first = (await item.first().innerText()).trim().match(/^[\d,]+/);
  return first ? Number(first[0].replace(/,/g, '')) : null;
}
