import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export const PASSWORD = 'synthetic e2e password 2026';

let counter = 0;
export function uniqueUserName(prefix = 'E2E') {
  counter += 1;
  return `${prefix} ${Date.now().toString(36)}${counter}`;
}

/** Opens the app; the server token travels as a header (see playwright.config.js). */
export async function openApp(page) {
  await page.goto('/app');
}

export async function createUser(page, name = uniqueUserName()) {
  await openApp(page);
  // The form appears once the user directory has loaded.
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  const heading = page.getByRole('heading', { level: 1 });
  if ((await heading.textContent()).includes('Unlock')) {
    await page.getByRole('button', { name: 'Create user' }).click();
  }
  await page.getByLabel('User name').fill(name);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repeat password').fill(PASSWORD);
  await page.getByRole('button', { name: /Create empty user/ }).click();
  await expect(page.getByRole('button', { name: 'Lock / Switch user' })).toBeVisible();
  return name;
}

export async function unlock(page, name, password = PASSWORD) {
  await expect(page.getByRole('heading', { name: 'Unlock your finances' })).toBeVisible();
  await page.getByRole('combobox', { name: 'User', exact: true }).selectOption({ label: name });
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Unlock' }).click();
}

/** Client-side navigation: a full reload would lock the session, as it does for users. */
export async function go(page, path) {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  const escaped = path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  await expect(page).toHaveURL(new RegExp(`${escaped}$`));
}

/** Resolves when the next workspace save reaches the server. Call before the edit. */
export function nextSave(page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/api\/(changes|data)$/.test(new URL(response.url()).pathname) &&
      response.ok(),
  );
}

export async function waitForSynced(page) {
  await expect(page.getByRole('button', { name: /Create backup now/ })).toBeEnabled({
    timeout: 15_000,
  });
}

export async function importDemoCsv(page) {
  await go(page, '/app/import');
  await page.locator('input[type="file"][accept=".csv"]').setInputFiles('public/demo-revolut.csv');
  const add = page.getByRole('button', { name: /^Add \d+ transactions?$/ });
  await expect(add).toBeEnabled({ timeout: 15_000 });
  const count = Number((await add.textContent()).match(/\d+/)[0]);
  await add.click();
  await expect(page.getByRole('button', { name: /Continue to overview/ })).toBeVisible();
  return count;
}

/** No serious or critical accessibility violations on the current screen. */
export async function expectAccessible(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const blocking = results.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact),
  );
  expect(
    blocking.map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => `${node.target.join(' ')} ${node.any[0]?.message || ''}`).join(', ')}`,
    ),
  ).toEqual([]);
}
