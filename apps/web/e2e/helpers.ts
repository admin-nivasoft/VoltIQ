import { expect, type Page } from '@playwright/test';

/** Signs in through the development switcher, the way a person would. */
export async function signIn(
  page: Page,
  group: 'Consumer A' | 'Consumer B' | 'Consumer C' | 'Platform',
  role: string,
) {
  await page.goto('/');
  const box = page.getByRole('group', { name: new RegExp(group) });
  await box.getByRole('button', { name: role }).click();
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(/sign in/i);
}

export const activeAlertsTile = (page: Page) =>
  page.locator('dt', { hasText: 'Active alerts' }).locator('..').locator('dd').first();
