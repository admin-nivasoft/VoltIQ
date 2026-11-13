import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function pick(page: Page, company: RegExp, person: string, visit = true) {
  if (visit) await page.goto('/');
  await page.getByRole('group', { name: company }).getByRole('button', { name: person }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Fleet health' })).toBeVisible();
}
const activeAlerts = (page: Page) =>
  page.locator('dt', { hasText: 'Active alerts' }).locator('..').locator('dd').first();

test('the DEMO banner is on every page, including before sign-in', async ({ page }) => {
  await page.goto('/');
  const banner = page.getByRole('complementary', { name: 'Demo notice' });
  await expect(banner).toContainText('DEMO');
  await expect(banner).toContainText(/sample data only/i);
  await expect(page.getByRole('heading', { name: 'Choose a demo user' })).toBeVisible();
  await pick(page, /Aurora Motors/, 'Fleet manager');
  await expect(banner).toBeVisible();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(banner).toBeVisible();
});

test('works with no server: tiles, alerts and packs all load', async ({ page }) => {
  await pick(page, /Aurora Motors/, 'Fleet manager');
  await expect(page.getByText('Packs in service')).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Alerts' }).getByRole('article').first(),
  ).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByText(/Showing 1–25 of 40 packs/)).toBeVisible();
  await expect(page.getByText('Aurora Motors (OEM)').first()).toBeVisible();
  await expect(page.getByText('Packs supplied by 82 Volts')).toBeVisible();
});

test('a fleet manager acknowledges an alert and the Active alerts count drops', async ({
  page,
}) => {
  await pick(page, /Aurora Motors/, 'Fleet manager');
  const tile = activeAlerts(page);
  await expect(tile).toHaveText(/^\d+$/);
  const before = Number(await tile.textContent());
  await page
    .getByRole('button', { name: /^Acknowledge/ })
    .first()
    .click();
  await expect(tile).toHaveText(String(before - 1));
  await expect(page.getByText(/Alert acknowledged/)).toBeAttached();
});

test('a technician cannot acknowledge, and each company only sees its own fleet', async ({
  page,
}) => {
  await pick(page, /Aurora Motors/, 'Technician');
  await expect(
    page.getByRole('region', { name: 'Alerts' }).getByRole('article').first(),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Acknowledge/ })).toHaveCount(0);
  await expect(page.getByRole('table')).toContainText('QL-A-');
  expect(await page.locator('body').innerText()).not.toContain('QL-B-');

  await page.getByRole('button', { name: /Sign out/ }).click();
  await expect(page.getByRole('heading', { name: 'Choose a demo user' })).toBeVisible();
  await pick(page, /Meridian Storage/, 'Fleet manager', false);
  await expect(page.getByText('Meridian Storage Systems').first()).toBeVisible();
  await expect(page.getByRole('table')).toContainText('QL-B-');
  expect(await page.locator('body').innerText()).not.toContain('QL-A-');
});

test('search and sort work', async ({ page }) => {
  await pick(page, /Northgate Logistics/, 'Consumer admin');
  await page.getByLabel('Search packs').fill('QL-C-0007');
  await expect(page.getByRole('table').getByRole('rowheader')).toHaveText(['QL-C-0007']);
  await page.getByLabel('Search packs').fill('');
  const soh = page.getByRole('columnheader', { name: /State of health/ });
  await soh.getByRole('button').click();
  await expect(soh).toHaveAttribute('aria-sort', 'ascending');
  await expect
    .poll(async () => {
      const v = (await page.getByTestId('soh-value').allTextContents())
        .map(Number.parseFloat)
        .filter((n) => !Number.isNaN(n));
      return v.length > 5 && v.every((n, i) => i === 0 || v[i - 1]! <= n);
    })
    .toBe(true);
});

test('the platform admin sees a plain no-access page, not a broken one', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('group', { name: /Platform administration/ })
    .getByRole('button', { name: 'Platform admin' })
    .click();
  await expect(page.getByText(/don.t have access to fleet health/i)).toBeVisible();
});

test('Reset demo puts everything back, and a reload starts from the sample data', async ({
  page,
}) => {
  await pick(page, /Aurora Motors/, 'Fleet manager');
  const tile = activeAlerts(page);
  const before = Number(await tile.textContent());
  await page
    .getByRole('button', { name: /^Acknowledge/ })
    .first()
    .click();
  await expect(tile).toHaveText(String(before - 1));
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a demo user' })).toBeVisible();
  await pick(page, /Aurora Motors/, 'Fleet manager');
  await expect(activeAlerts(page)).toHaveText(String(before));
});

for (const width of [390, 768, 1440]) {
  test.describe(`axe at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    const serious = async (page: Page) =>
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
      ).violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.impact}: ${v.id} ${v.nodes[0]?.target.join(' ')}`);

    test('demo sign-in and fleet pages have no serious or critical issues', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Choose a demo user' })).toBeVisible();
      expect(await serious(page)).toEqual([]);
      await pick(page, /Aurora Motors/, 'Fleet manager');
      await expect(page.getByText(/Showing 1–25 of 40 packs/)).toBeVisible();
      expect(await serious(page)).toEqual([]);
    });

    test('no sideways scrolling and touch-sized controls', async ({ page }) => {
      await pick(page, /Aurora Motors/, 'Fleet manager');
      await expect(page.getByText(/Showing 1–25 of 40 packs/)).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      ).toBe(false);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('a, button, select, input')]
          .filter(
            (e) =>
              (e as HTMLElement).offsetParent !== null &&
              !e.closest('.sr-only') &&
              !(e as HTMLElement).className.includes('sr-only'),
          )
          .filter((e) => e.getBoundingClientRect().height < 43.5)
          .map((e) => `${e.tagName}:${(e.textContent ?? '').trim().slice(0, 30)}`),
      );
      expect(small).toEqual([]);
    });
  });
}
