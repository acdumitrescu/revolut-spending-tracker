import { expect, test } from '@playwright/test';
import {
  PASSWORD,
  createUser,
  expectAccessible,
  go,
  importDemoCsv,
  nextSave,
  unlock,
  waitForSynced,
} from './helpers.js';

// Under ten journeys on purpose: most behaviour is covered by fast unit tests.
// Each journey creates its own user; the server allows 20 users and a few open sessions,
// so a run of 5 journeys x 2 engines fits, and every journey locks its session at the end.
test.afterEach(async ({ page }) => {
  const lock = page.getByRole('button', { name: 'Lock / Switch user' });
  if (await lock.isVisible().catch(() => false)) {
    await lock.click();
    await expect(lock).toHaveCount(0);
  }
});

test('create a user, lock, refuse a wrong password, unlock again', async ({ page }) => {
  const name = await createUser(page);
  const lock = page.getByRole('button', { name: 'Lock / Switch user' });
  await lock.click();
  // Locking saves first; reloading mid-save is cancelled by WebKit's unload policy.
  await expect(lock).toHaveCount(0);
  await page.reload();
  await unlock(page, name, `${PASSWORD} wrong`);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lock / Switch user' })).toHaveCount(0);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('button', { name: 'Lock / Switch user' })).toBeVisible();
});

test('import the demo CSV, edit a category and a currency, and keep them after reload', async ({
  page,
}) => {
  const name = await createUser(page);
  const added = await importDemoCsv(page);
  expect(added).toBeGreaterThan(5);

  // A second import of the same file adds nothing.
  await go(page, '/app/import');
  await page.locator('input[type="file"][accept=".csv"]').setInputFiles('public/demo-revolut.csv');
  await expect(page.getByText(/duplicate/i).first()).toBeVisible();

  await go(page, '/app/activity/transactions');
  await page.getByPlaceholder('Search activity').fill('Kaufland');
  await page.getByRole('button', { name: 'Edit category for Kaufland' }).first().click();
  await page.getByLabel('Category', { exact: true }).selectOption('Shopping');
  await page.getByRole('button', { name: 'Save' }).click();
  const saved = nextSave(page);
  await page.getByLabel('Currency for Kaufland').first().selectOption('EUR');
  await expect(page.getByRole('button', { name: /Restore RON/ }).first()).toBeVisible();
  await saved;

  await page.reload();
  await unlock(page, name);
  await go(page, '/app/activity/transactions');
  await page.getByPlaceholder('Search activity').fill('Kaufland');
  await expect(
    page.getByRole('button', { name: 'Edit category for Kaufland' }).first(),
  ).toContainText('Shopping');
  await expect(page.getByLabel('Currency for Kaufland').first()).toHaveValue('EUR');
});

test('export JSON downloads a backup file', async ({ page }) => {
  await createUser(page);
  await importDemoCsv(page);
  await go(page, '/app/import');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
});

test('create an encrypted backup and restore it', async ({ page }) => {
  await createUser(page);
  await importDemoCsv(page);
  await go(page, '/app/import');
  await waitForSynced(page);
  await page.getByRole('button', { name: /Create backup now/ }).click();
  const toast = page.getByText(/Private backup created: /);
  await expect(toast).toBeVisible();
  const filename = (await toast.textContent()).split('Private backup created: ')[1].trim();

  await page.getByRole('button', { name: 'Show encrypted backups' }).click();
  await page.getByRole('button', { name: filename }).click();
  const replace = page.getByRole('button', { name: 'Back up current data and replace workspace' });
  await expect(replace).toBeEnabled();
  await replace.click();
  await expect(replace).toHaveCount(0);
  await go(page, '/app/activity/transactions');
  await expect(page.getByRole('button', { name: /Edit category for/ }).first()).toBeVisible();
});

test('main screens have no serious accessibility violations', async ({ page }) => {
  await createUser(page);
  await importDemoCsv(page);
  // Theme changes animate; check settled colours, not mid-transition ones.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const theme of ['dark', 'light']) {
    const toggle = page.getByRole('button', { name: /Switch to (light|dark) theme/ });
    if ((await toggle.getAttribute('aria-label'))?.includes(theme)) await toggle.click();
    for (const path of ['/app', '/app/activity/transactions', '/app/import', '/app/settings']) {
      await go(page, path);
      await page.waitForLoadState('networkidle');
      await test.step(`${theme} ${path}`, () => expectAccessible(page));
    }
  }
});
