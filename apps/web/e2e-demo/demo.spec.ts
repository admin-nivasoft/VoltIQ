import type { Page } from '@playwright/test';
import {
  attentionCount,
  axeViolations,
  expect,
  goTo,
  openFirstBattery,
  scrollsSideways,
  signIn,
  test,
  WIDTHS,
} from './fixtures';

const NO_BIRTH = /batter(y|ies) without factory record/;
const UNMATCHED = /battery IDs? (is|are) not recognised/;
const chooseBirthSample = async (page: Page) => {
  await page.locator('label', { hasText: 'birth-records-sample.csv' }).click();
  await expect(page.getByRole('radio', { name: /birth-records-sample.csv/ })).toBeChecked();
};
const WORKING = /^How Batteries on record is worked out/;

test('the DEMO banner is on every screen, including before sign-in', async ({ page }) => {
  await page.goto('/');
  const banner = page.getByRole('complementary', { name: 'Demo notice' });
  await expect(banner).toContainText('DEMO');
  await expect(banner).toContainText(/sample data only/i);
  await expect(banner).toContainText(/nothing is saved/i);
  await expect(page.getByRole('heading', { name: 'Choose a demo user' })).toBeVisible();
  await signIn(page, 'Battery manager', false);
  await expect(banner).toBeVisible();
  await goTo(page, 'Factory data import');
  await expect(banner).toBeVisible();
  await goTo(page, 'Data connection');
  await expect(banner).toBeVisible();
});

test('sign-in offers Lumen Ridge only, by role, and never the hidden second manufacturer', async ({
  page,
}) => {
  await page.goto('/');
  const group = page.getByRole('group', { name: 'Lumen Ridge Batteries · battery manufacturer' });
  await expect(group.getByRole('button')).toHaveText([
    /Battery manager.*Ananya Desai/s,
    /Admin.*Rohan Mehta/s,
  ]);
  expect(await page.locator('body').innerText()).not.toMatch(/Corvane|Ines Varga|Tomas Lindqvist/);
});

test('works with no server: the overview, its figures and the battery list load from the browser', async ({
  page,
}) => {
  await signIn(page, 'Battery manager');
  await expect(page.getByRole('heading', { name: 'Fleet at a glance' })).toBeVisible();
  await expect(page.getByText('Lumen Ridge Batteries · 48 batteries registered')).toBeVisible();
  await expect(page.getByText('Ananya Desai').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Open warnings' })).toBeVisible();
  expect(await attentionCount(page, /open warnings?/)).toBe(5);
  expect(await attentionCount(page, NO_BIRTH)).toBe(2);
  expect(await attentionCount(page, UNMATCHED)).toBe(2);
});

test('all four screens are reachable by clicking, and each has a way back', async ({ page }) => {
  await signIn(page, 'Battery manager');
  // Fleet overview -> a battery -> back by the link on that page.
  const serial = await openFirstBattery(page);
  await expect(page).toHaveURL(/\/batteries\/[0-9a-f-]{36}$/);
  await page.getByRole('link', { name: 'Fleet overview' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Fleet overview' })).toBeVisible();
  // The browser back button works too.
  await page.getByRole('link', { name: serial, exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: serial })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Fleet overview' })).toBeVisible();
  // The other two screens, from the main navigation, and back to the start.
  await goTo(page, 'Factory data import');
  await expect(page).toHaveURL(/\/imports$/);
  await goTo(page, 'Data connection');
  await expect(page).toHaveURL(/\/connection$/);
  await goTo(page, 'Fleet overview');
  await expect(page).toHaveURL(/\/$/);
});

test('a "needs attention" card leads on to the section it counts', async ({ page }) => {
  await signIn(page, 'Battery manager');
  await page
    .getByRole('region', { name: 'Needs attention' })
    .getByRole('link')
    .filter({ hasText: UNMATCHED })
    .click();
  await expect(page).toHaveURL(/#data-quality$/);
  await expect(page.getByRole('heading', { name: 'Unrecognised battery IDs' })).toBeVisible();
});

test('an unknown address says so and links back', async ({ page }) => {
  await signIn(page, 'Battery manager');
  await page.getByRole('heading', { level: 1, name: 'Fleet overview' }).waitFor();
  await page.evaluate(() => {
    window.history.pushState({}, '', '/no-such-page');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to the fleet overview' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Fleet overview' })).toBeVisible();
});

test('a "how it is worked out" panel opens on keyboard focus, shows the formula, and closes on Escape', async ({
  page,
}) => {
  await signIn(page, 'Battery manager');
  const trigger = page.getByRole('button', { name: WORKING });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus();
  const panel = page.getByRole('tooltip');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('How this is worked out');
  await expect(panel).toContainText('number of battery records');
  await expect(panel).toContainText('batteries_registered');
  await expect(panel).toContainText('Based on');
  await expect(trigger).toHaveAttribute('aria-describedby', (await panel.getAttribute('id'))!);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('the panel is reachable with Tab alone', async ({ page }) => {
  await signIn(page, 'Battery manager');
  const trigger = page.getByRole('button', { name: WORKING });
  await trigger.scrollIntoViewIfNeeded();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  let reached = false;
  for (let i = 0; i < 60 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await trigger.evaluate((el) => el === document.activeElement);
  }
  expect(reached, 'Tab reaches the panel button').toBe(true);
  await expect(page.getByRole('tooltip')).toContainText('number of battery records');
});

test('an admin import: checking changes nothing, importing resolves the 2 batteries and 1 unrecognised ID, and the overview follows', async ({
  page,
}) => {
  await signIn(page, 'Admin');
  expect(await attentionCount(page, NO_BIRTH)).toBe(2);
  expect(await attentionCount(page, UNMATCHED)).toBe(2);
  await expect(page.getByText('Lumen Ridge Batteries · 48 batteries registered')).toBeVisible();

  await goTo(page, 'Factory data import');
  await expect(page.getByRole('button', { name: 'Check file' })).toBeDisabled();
  await chooseBirthSample(page);
  await page.getByRole('button', { name: 'Check file' }).click();
  await expect(page.getByRole('heading', { name: /Check result/ })).toBeVisible();
  await expect(
    page.getByText(/Importing adds 4 factory records \(2 new batteries\) and clears 1 unrecognised battery ID/),
  ).toBeVisible();
  await expect(page.getByText('File imported')).toHaveCount(0);

  // Checking is not importing: the overview still shows the old counts.
  await goTo(page, 'Fleet overview');
  expect(await attentionCount(page, NO_BIRTH)).toBe(2);
  expect(await attentionCount(page, UNMATCHED)).toBe(2);

  await goTo(page, 'Factory data import');
  await chooseBirthSample(page);
  await page.getByRole('button', { name: 'Check file' }).click();
  await page.getByRole('button', { name: 'Import file' }).click();
  await expect(page.getByText('File imported')).toBeVisible();
  await expect(page.getByText(/Resolved battery ID BMS-7F3A9C/)).toBeVisible();

  await goTo(page, 'Fleet overview');
  await expect(page.getByText('Lumen Ridge Batteries · 50 batteries registered')).toBeVisible();
  expect(await attentionCount(page, NO_BIRTH)).toBeNull();
  expect(await attentionCount(page, UNMATCHED)).toBe(1);
});

test('an admin links an unrecognised battery ID: it leaves the list and the overview count drops', async ({
  page,
}) => {
  await signIn(page, 'Admin');
  await goTo(page, 'Data connection');
  const section = page.getByRole('region', { name: 'Unrecognised battery IDs', exact: true });
  await expect(section).toContainText('BMS-7F3A9C');
  await expect(section).toContainText('BMS-0B21D4');
  await section.getByRole('button', { name: 'Link to a battery' }).first().click();
  const choose = section.getByLabel(/Battery \(factory serial\) for BMS-7F3A9C/);
  await expect(section.getByRole('button', { name: 'Link ID' })).toBeDisabled();
  await choose.selectOption({ index: 1 });
  const serial = (await choose.locator('option:checked').textContent())!.trim();
  await section.getByRole('button', { name: 'Link ID' }).click();
  await expect(section.getByText(`BMS-7F3A9C is linked to ${serial}`)).toBeVisible();
  await expect(section.getByText('BMS-7F3A9C', { exact: true })).toHaveCount(0);
  await expect(section.getByText('BMS-0B21D4').first()).toBeVisible();

  await goTo(page, 'Fleet overview');
  expect(await attentionCount(page, UNMATCHED)).toBe(1);
  expect(await attentionCount(page, NO_BIRTH)).toBe(2);
});

test('Reset demo puts everything back, and a new sign-in starts from the sample data', async ({
  page,
}) => {
  await signIn(page, 'Admin');
  await goTo(page, 'Data connection');
  const section = page.getByRole('region', { name: 'Unrecognised battery IDs', exact: true });
  await section.getByRole('button', { name: 'Link to a battery' }).first().click();
  await section.getByLabel(/Battery \(factory serial\) for/).selectOption({ index: 1 });
  await section.getByRole('button', { name: 'Link ID' }).click();
  await expect(section.getByText(/is linked to/)).toBeVisible();
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a demo user' })).toBeVisible();
  await signIn(page, 'Admin', false);
  expect(await attentionCount(page, UNMATCHED)).toBe(2);
});

test('signing out returns to the sign-in, and a deep link while signed out goes there too', async ({
  page,
}) => {
  await signIn(page, 'Battery manager');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a demo user' })).toBeVisible();
  await page.goto('/connection');
  await expect(page.getByRole('heading', { name: 'Choose a demo user' })).toBeVisible();
});

for (const width of WIDTHS) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('sign-in: no axe violations, no sideways scrolling', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Choose a demo user' })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
      expect(await scrollsSideways(page)).toBe(false);
    });

    test('fleet overview: no axe violations, no sideways scrolling', async ({ page }) => {
      await signIn(page, 'Admin');
      expect(await axeViolations(page)).toEqual([]);
      expect(await scrollsSideways(page)).toBe(false);
    });

    test('a battery: no axe violations, no sideways scrolling', async ({ page }) => {
      await signIn(page, 'Admin');
      await openFirstBattery(page);
      expect(await axeViolations(page)).toEqual([]);
      expect(await scrollsSideways(page)).toBe(false);
    });

    test('factory data import, before and after checking a file: no axe violations, no sideways scrolling', async ({
      page,
    }) => {
      await signIn(page, 'Admin');
      await goTo(page, 'Factory data import');
      const before = await axeViolations(page);
      expect(await scrollsSideways(page)).toBe(false);
      await chooseBirthSample(page);
      await page.getByRole('button', { name: 'Check file' }).click();
      await expect(page.getByRole('heading', { name: /Check result/ })).toBeVisible();
      const after = await axeViolations(page);
      expect(await scrollsSideways(page)).toBe(false);
      expect({ before, after }).toEqual({ before: [], after: [] });
    });

    test('Data connection, with the link form open: no axe violations, no sideways scrolling', async ({
      page,
    }) => {
      await signIn(page, 'Admin');
      await goTo(page, 'Data connection');
      const before = await axeViolations(page);
      expect(await scrollsSideways(page)).toBe(false);
      await page.getByRole('button', { name: 'Link to a battery' }).first().click();
      await expect(page.getByLabel(/Battery \(factory serial\) for/)).toBeVisible();
      const open = await axeViolations(page);
      expect(await scrollsSideways(page)).toBe(false);
      expect({ before, open }).toEqual({ before: [], open: [] });
    });

    test('a working panel open: no axe violations, no sideways scrolling', async ({ page }) => {
      await signIn(page, 'Battery manager');
      const trigger = page.getByRole('button', { name: WORKING });
      await trigger.scrollIntoViewIfNeeded();
      await trigger.focus();
      await expect(page.getByRole('tooltip')).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
      expect(await scrollsSideways(page)).toBe(false);
    });
  });
}
