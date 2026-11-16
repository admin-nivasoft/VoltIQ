import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function pick(page: Page, company: RegExp, person: string, visit = true) {
  if (visit) await page.goto('/');
  await page.getByRole('group', { name: company }).getByRole('button', { name: person }).click();
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(/sign in/i);
}
const openSettings = async (page: Page) => {
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
};

test('channels: a "fail" address fails the test message and shows in the delivery log, with no server', async ({
  page,
}) => {
  await pick(page, /Aurora Motors/, 'Consumer admin');
  await openSettings(page);
  await page.getByLabel('Email address').fill('fail@example.test');
  await page.getByRole('button', { name: 'Save channels' }).click();
  await expect(page.getByText(/Channels saved/)).toBeAttached();
  await page.getByRole('button', { name: /Send test message to Email/ }).click();
  await expect(page.getByText(/Test message to Email failed/)).toBeVisible();
  const first = page.getByRole('region', { name: 'Delivery log table' }).getByRole('row').nth(1);
  await expect(first).toContainText('Test message');
  await expect(first).toContainText('Failed, attempt 1');
});

test('the delivery log already has failed attempts to look at', async ({ page }) => {
  await pick(page, /Aurora Motors/, 'Consumer admin');
  await openSettings(page);
  await expect(page.getByText('Failed, attempt 3')).toBeVisible();
});

test('a consumer admin has no policy editor; the platform admin does, and an edit really changes what a fleet manager can do', async ({
  page,
}) => {
  await pick(page, /Aurora Motors/, 'Consumer admin');
  await openSettings(page);
  await expect(page.getByRole('heading', { name: 'Role policy' })).toHaveCount(0);

  await page.getByRole('button', { name: /Sign out/ }).click();
  await expect(page.getByRole('heading', { name: 'Choose a demo user' })).toBeVisible();
  await pick(page, /Platform administration/, 'Platform admin', false);
  await openSettings(page);
  await page.getByRole('checkbox', { name: 'Fleet manager: Acknowledge alerts' }).uncheck();
  await page.getByRole('button', { name: 'Save as a new version' }).click();
  await expect(page.getByText(/Saved as version 2/).first()).toBeVisible();

  await page.getByRole('button', { name: /Sign out/ }).click();
  await expect(page.getByRole('heading', { name: 'Choose a demo user' })).toBeVisible();
  await pick(page, /Aurora Motors/, 'Fleet manager', false);
  await expect(
    page.getByRole('region', { name: 'Alerts' }).getByRole('article').first(),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Acknowledge/ })).toHaveCount(0);
});

for (const width of [390, 768, 1440]) {
  test.describe(`axe on the demo settings pages at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    const serious = async (page: Page) =>
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
      ).violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.impact}: ${v.id} ${v.nodes[0]?.target.join(' ')}`);

    test('consumer admin and platform admin settings', async ({ page }) => {
      await pick(page, /Aurora Motors/, 'Consumer admin');
      await openSettings(page);
      await expect(page.getByText('Failed, attempt 3')).toBeVisible();
      expect(await serious(page)).toEqual([]);
      await page.getByRole('button', { name: /Sign out/ }).click();
      await expect(page.getByRole('heading', { name: 'Choose a demo user' })).toBeVisible();
      await pick(page, /Platform administration/, 'Platform admin', false);
      await openSettings(page);
      await expect(page.getByRole('heading', { name: 'Role policy' })).toBeVisible();
      expect(await serious(page)).toEqual([]);
    });
  });
}
