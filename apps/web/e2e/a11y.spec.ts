import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

const WIDTHS = [390, 768, 1440] as const;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function serious(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.impact}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`);
}

for (const width of WIDTHS) {
  test.describe(`axe at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('sign-in page has no serious or critical issues', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
      expect(await serious(page)).toEqual([]);
    });

    test('fleet health page has no serious or critical issues', async ({ page }) => {
      await signIn(page, 'Consumer A', 'Fleet manager');
      await expect(page.getByText('Packs in service')).toBeVisible();
      await expect(page.getByRole('region', { name: 'Packs' }).getByText(/Showing/)).toBeVisible();
      expect(await serious(page)).toEqual([]);
    });

    test('the search-with-no-results state has no serious or critical issues', async ({ page }) => {
      await signIn(page, 'Consumer A', 'Technician');
      await page.getByLabel('Search packs').fill('no-such-pack');
      await expect(page.getByRole('heading', { name: /No packs match/ })).toBeVisible();
      expect(await serious(page)).toEqual([]);
    });
  });
}
