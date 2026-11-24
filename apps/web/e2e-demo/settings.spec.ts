// The demo has no settings screen of its own. What it has is the example settings (reporting window,
// send interval, coverage period, rule limits) that the figures use, and the role permissions that
// decide who may import and link. This suite covers both, and that the second manufacturer stays hidden.
import { expect, goTo, signIn, test } from './fixtures';

test('a battery manager sees no upload or link controls anywhere', async ({ page }) => {
  await signIn(page, 'Battery manager');

  await goTo(page, 'Factory data import');
  await expect(page.getByText('Only an Admin can import files')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose a file' })).toHaveCount(0);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Check file|Import file|Choose a CSV file/ })).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  // The history is still readable.
  await expect(page.getByRole('heading', { name: 'Import history' })).toBeVisible();
  await expect(page.getByText('birth-records-sample.csv').first()).toBeVisible();

  await goTo(page, 'Data connection');
  const section = page.getByRole('region', { name: 'Unrecognised battery IDs', exact: true });
  await expect(section).toContainText('BMS-7F3A9C');
  await expect(section.getByRole('button', { name: /Link/ })).toHaveCount(0);
  await expect(section.getByRole('combobox')).toHaveCount(0);
});

test('an admin has the controls the battery manager lacks', async ({ page }) => {
  await signIn(page, 'Admin');
  await goTo(page, 'Factory data import');
  await expect(page.getByRole('heading', { name: 'Choose a file' })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Choose a CSV file', exact: true })).toBeVisible();
  await goTo(page, 'Data connection');
  await expect(
    page
      .getByRole('region', { name: 'Unrecognised battery IDs', exact: true })
      .getByRole('button', { name: 'Link to a battery' })
      .first(),
  ).toBeVisible();
});

test('a battery without a factory record offers the import link to an admin only', async ({ page }) => {
  const openNoBirthBattery = async () => {
    await page
      .getByRole('region', { name: 'Data quality' })
      .getByRole('link', { name: /^LRB-/ })
      .first()
      .click();
    await expect(page.getByText('No factory record for this battery').first()).toBeVisible();
  };
  await signIn(page, 'Admin');
  await openNoBirthBattery();
  await expect(page.getByRole('link', { name: 'Import factory data' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, 'Battery manager', false);
  await openNoBirthBattery();
  await expect(page.getByRole('link', { name: 'Import factory data' })).toHaveCount(0);
});

test('the example settings the figures use are shown with their figures, as examples', async ({ page }) => {
  await signIn(page, 'Battery manager');
  await expect(page.getByText(/Sent data in the last 24 hours \(example setting\)/)).toBeVisible();
  const trigger = page.getByRole('button', { name: /^How Reporting now comes from|^How Reporting now is worked out/ });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus();
  await expect(page.getByRole('tooltip')).toContainText('24-hour window (example setting)');
});

test("another manufacturer's batteries are never on any screen, and its battery addresses say not found", async ({ page }) => {
  await signIn(page, 'Admin');
  const everyScreen = async () => {
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/Corvane|CPC-|BMS-CPC-ORPHAN|Ines Varga|Tomas Lindqvist/);
  };
  await everyScreen();
  await goTo(page, 'Factory data import');
  await everyScreen();
  await goTo(page, 'Data connection');
  await everyScreen();

  // A Corvane battery id typed into the address bar: the app has no such battery for this user.
  await page.evaluate(() => {
    window.history.pushState({}, '', '/batteries/b3000000-0000-4000-9000-000000000001');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByText('We could not find that battery')).toBeVisible();
  await everyScreen();
});
