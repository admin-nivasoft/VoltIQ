import { expect, test } from '@playwright/test';
import { activeAlertsTile, signIn } from './helpers';

test.describe('fleet health screen', () => {
  test('a fleet manager acknowledges an alert and the Active alerts count drops', async ({
    page,
  }) => {
    await signIn(page, 'Consumer A', 'Fleet manager');
    await expect(page.getByRole('heading', { level: 1, name: 'Fleet health' })).toBeVisible();
    await expect(page.getByText('Packs in service')).toBeVisible();

    const tile = activeAlertsTile(page);
    await expect(tile).toHaveText(/^\d+$/);
    const before = Number(await tile.textContent());
    expect(before).toBeGreaterThan(0);

    const alerts = page.getByRole('region', { name: 'Alerts' }).getByRole('article');
    await expect(alerts).toHaveCount(Math.min(before, 10));
    const target = alerts.first();
    const title = await target.getByRole('heading', { level: 3 }).textContent();
    // Several alerts share a title, so follow this one by its own id.
    const labelId = await target.getAttribute('aria-labelledby');
    const thisAlert = (scope = page) => scope.locator(`article[aria-labelledby="${labelId}"]`);
    await target.getByRole('button', { name: /^Acknowledge/ }).click();

    await expect(page.getByText(`Alert acknowledged: ${title}`)).toBeAttached();
    await expect(tile).toHaveText(String(before - 1));
    await expect(thisAlert()).toHaveCount(0); // gone from the Open list
    // Focus is not lost to the page body: it is back on the Alerts heading.
    await expect(page.getByRole('heading', { level: 2, name: 'Alerts' })).toBeFocused();

    // The acknowledgement is real: it shows under "Acknowledged", with who did it.
    await page.getByLabel('Show').selectOption('acknowledged');
    const done = thisAlert();
    await expect(done).toContainText('Acknowledged by Fleet Manager A');
    await expect(done.getByRole('button', { name: /Acknowledge/ })).toHaveCount(0);
  });

  test('a technician sees the alerts but has no Acknowledge button', async ({ page }) => {
    await signIn(page, 'Consumer A', 'Technician');
    await expect(
      page.getByRole('region', { name: 'Alerts' }).getByRole('article').first(),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Acknowledge/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  });

  test('the pack table searches and sorts, with aria-sort on the headers', async ({ page }) => {
    await signIn(page, 'Consumer A', 'Fleet manager');
    const table = page.getByRole('table');
    await expect(table).toBeVisible();
    await expect(page.getByText(/Showing 1–25 of 40 packs/)).toBeVisible();

    await page.getByLabel('Search packs').fill('QL-A-0007');
    await expect(page.getByText(/Showing 1–1 of 1 packs/)).toBeVisible();
    await expect(table.getByRole('rowheader')).toHaveText(['QL-A-0007']);
    await page.getByLabel('Search packs').fill('');
    await expect(page.getByText(/of 40 packs/)).toBeVisible();

    const soh = table.getByRole('columnheader', { name: /State of health/ });
    await soh.getByRole('button').click();
    await expect(soh).toHaveAttribute('aria-sort', 'ascending');
    await expect(table.getByRole('columnheader', { name: /Serial/ })).toHaveAttribute(
      'aria-sort',
      'none',
    );
    // The rows refetch from the server, so wait until they really are in ascending order.
    await expect
      .poll(async () => {
        const values = await table.getByTestId('soh-value').allTextContents();
        const nums = values.map((v) => Number.parseFloat(v)).filter((n) => !Number.isNaN(n));
        return nums.length > 5 && nums.every((n, i) => i === 0 || nums[i - 1]! <= n);
      })
      .toBe(true);
  });

  test('each pack shows trend, remaining life with confidence and warranty as text', async ({
    page,
  }) => {
    await signIn(page, 'Consumer A', 'Fleet manager');
    const table = page.getByRole('table');
    await expect(table.getByText('Declining').first()).toBeVisible();
    await expect(table.getByText('Improving').first()).toBeVisible();
    await expect(table.getByText(/\d+% confidence/).first()).toBeVisible();
    await expect(table.getByText(/Warranty (active|expiring|expired)/).first()).toBeVisible();
  });

  test('another consumer is never visible: no canary text, ids or names', async ({ page }) => {
    await signIn(page, 'Consumer A', 'Fleet manager');
    await expect(page.getByRole('table')).toBeVisible();
    const text = await page.locator('body').innerText();
    for (const banned of ['CANARY', 'QL-B-', 'QL-C-', 'ASSET-B-', 'ASSET-C-'])
      expect(text).not.toContain(banned);
    await page.getByLabel('Search packs').fill('QL-B-0001');
    await expect(page.getByRole('heading', { name: /No packs match/ })).toBeVisible();
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('the pack table becomes cards with the same data, sort and search', async ({ page }) => {
      await signIn(page, 'Consumer A', 'Fleet manager');
      await expect(page.getByRole('table')).toHaveCount(0);
      const cards = page.getByRole('region', { name: 'Packs' }).getByRole('article');
      await expect(cards.first()).toBeVisible();
      await expect(cards.first()).toContainText(/% confidence|Not available/);
      await page.getByLabel('Sort by').selectOption('sohPct:asc');
      await page.getByLabel('Search packs').fill('QL-A-0007');
      await expect(cards).toHaveCount(1);
      await expect(cards.first()).toContainText('QL-A-0007');
    });

    test('nothing scrolls sideways and controls are touch-sized', async ({ page }) => {
      await signIn(page, 'Consumer A', 'Fleet manager');
      await expect(
        page.getByRole('region', { name: 'Packs' }).getByRole('article').first(),
      ).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow).toBe(false);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('a, button, select, input')]
          .filter(
            (e) =>
              (e as HTMLElement).offsetParent !== null &&
              !e.closest('.sr-only') &&
              !(e as HTMLElement).className.includes('sr-only'),
          )
          .filter((e) => e.getBoundingClientRect().height < 43.5)
          .map(
            (e) =>
              `${e.tagName}:${(e.textContent ?? '').trim().slice(0, 30)}:${Math.round(e.getBoundingClientRect().height)}`,
          ),
      );
      expect(small).toEqual([]);
    });
  });
});
