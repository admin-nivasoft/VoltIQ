import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

const openSettings = async (page: Page) => {
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
};

test.describe('settings', () => {
  test('save channels, send a test to a "fail" address, and see the failure in the delivery log', async ({
    page,
  }) => {
    await signIn(page, 'Consumer A', 'Consumer admin');
    await openSettings(page);

    await page.getByLabel('Email address').fill('fail@example.test');
    await page.getByRole('button', { name: 'Save channels' }).click();
    await expect(page.getByText(/Channels saved/)).toBeAttached();
    await expect(page.getByText('You have unsaved changes.')).toHaveCount(0);

    await page.getByRole('button', { name: /Send test message to Email/ }).click();
    await expect(page.getByText(/Test message to Email failed/)).toBeVisible();
    await expect(page.getByText(/rejected this address/).first()).toBeVisible();

    // The failure is in the delivery log, newest first, as a test message by email.
    const first = page.getByRole('region', { name: 'Delivery log table' }).getByRole('row').nth(1);
    await expect(first).toContainText('Test message');
    await expect(first).toContainText('Email');
    await expect(first).toContainText('Failed, attempt 1');

    // A good address works, and the log shows that as delivered.
    await page.getByLabel('Email address').fill('priya@example.test');
    await page.getByRole('button', { name: 'Save channels' }).click();
    await expect(page.getByText('You have unsaved changes.')).toHaveCount(0);
    await page.getByRole('button', { name: /Send test message to Email/ }).click();
    await expect(page.getByText('Test message sent to Email.')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Delivery log table' }).getByRole('row').nth(1),
    ).toContainText('Delivered, attempt 1');
  });

  test('a bad address is refused on the page, in plain words, before anything is sent', async ({
    page,
  }) => {
    await signIn(page, 'Consumer A', 'Technician');
    await openSettings(page);
    await page.getByLabel('Webhook address').fill('http://example.test/hook');
    await page.getByRole('button', { name: 'Save channels' }).click();
    await expect(page.getByRole('alert').first()).toContainText(/1 problem to fix/);
    await expect(page.getByLabel('Webhook address')).toBeFocused();
    await expect(page.getByText(/secure web address that starts with https/).first()).toBeVisible();
    // A technician manages channels but has no delivery log and no policy editor.
    await expect(page.getByRole('heading', { name: 'Delivery log' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Role policy' })).toHaveCount(0);
  });

  test('a consumer admin cannot reach the policy editor, and the API says 403', async ({
    page,
  }) => {
    await signIn(page, 'Consumer A', 'Consumer admin');
    await openSettings(page);
    await expect(page.getByRole('heading', { name: 'Role policy' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Delivery log' })).toBeVisible();

    const read = await page.request.get('/api/v1/admin/permissions');
    expect(read.status()).toBe(403);
    const write = await page.request.put('/api/v1/admin/permissions', {
      headers: { 'x-requested-with': 'ql' },
      data: {
        roles: {
          fleet_manager: ['fleet.view'],
          technician: [],
          consumer_admin: [],
          platform_admin: ['permissions.manage'],
        },
      },
    });
    expect(write.status()).toBe(403);
    expect((await write.json()).error.code).toBe('forbidden');
  });

  test('the platform admin changes the policy and a fleet manager really loses (and regains) the button', async ({
    page,
  }) => {
    const toggle = page.getByRole('checkbox', { name: 'Fleet manager: Acknowledge alerts' });
    try {
      await signIn(page, 'Platform', 'Platform admin');
      await openSettings(page);
      await expect(page.getByRole('heading', { name: 'Role policy' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'My notification channels' })).toHaveCount(0);
      await expect(toggle).toBeChecked();
      await toggle.uncheck();
      await page.getByRole('button', { name: 'Save as a new version' }).click();
      await expect(page.getByText(/Saved as version \d+/).first()).toBeVisible();

      await page.getByRole('button', { name: /Sign out/ }).click();
      await signIn(page, 'Consumer A', 'Fleet manager');
      await expect(
        page.getByRole('region', { name: 'Alerts' }).getByRole('article').first(),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /^Acknowledge/ })).toHaveCount(0);
    } finally {
      // Put the policy back so nothing else is affected, even if an assertion above failed.
      await page.getByRole('button', { name: /Sign out/ }).click();
      await signIn(page, 'Platform', 'Platform admin');
      await openSettings(page);
      if (!(await toggle.isChecked())) {
        await toggle.check();
        await page.getByRole('button', { name: 'Save as a new version' }).click();
        await expect(page.getByText(/Saved as version \d+/).first()).toBeVisible();
      }
    }
    await page.getByRole('button', { name: /Sign out/ }).click();
    await signIn(page, 'Consumer A', 'Fleet manager');
    await expect(page.getByRole('button', { name: /^Acknowledge/ }).first()).toBeVisible();
  });
});

const WIDTHS = [390, 768, 1440] as const;
const serious = async (page: Page) =>
  (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  ).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.impact}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`);

for (const width of WIDTHS) {
  test.describe(`axe on the settings pages at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('consumer admin: channels with an error and a failed test, and the delivery log', async ({
      page,
    }) => {
      await signIn(page, 'Consumer A', 'Consumer admin');
      await openSettings(page);
      await expect(page.getByRole('heading', { name: 'Delivery log' })).toBeVisible();
      await expect(page.getByLabel('Email address')).toBeVisible();
      expect(await serious(page)).toEqual([]);
      // With a validation error showing:
      await page.getByLabel('Mobile number').fill('123');
      await page.getByRole('button', { name: 'Save channels' }).click();
      await expect(page.getByText(/country code/).first()).toBeVisible();
      expect(await serious(page)).toEqual([]);
      // With a failed test result showing:
      await page.getByLabel('Mobile number').fill('');
      await page.getByLabel('Email address').fill('fail@example.test');
      await page.getByRole('button', { name: 'Save channels' }).click();
      await expect(page.getByText(/Channels saved/)).toBeAttached();
      await page.getByRole('button', { name: /Send test message to Email/ }).click();
      await expect(page.getByText(/Test message to Email failed/)).toBeVisible();
      expect(await serious(page)).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      ).toBe(false);
    });

    test('platform admin: the role policy editor', async ({ page }) => {
      await signIn(page, 'Platform', 'Platform admin');
      await openSettings(page);
      await expect(page.getByRole('heading', { name: 'Role policy' })).toBeVisible();
      await expect(page.getByRole('checkbox', { name: 'Technician: See alerts' })).toBeVisible();
      expect(await serious(page)).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      ).toBe(false);
    });
  });
}
