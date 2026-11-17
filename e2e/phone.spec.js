import { expect, test } from '@playwright/test';
import { createUser, importDemoCsv } from './helpers.js';

// iPhone-sized check of the core pages with synthetic demo data (plan 04, task 1.3).
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
});

test.afterEach(async ({ page }) => {
  const lock = page.getByRole('button', { name: 'Lock / Switch user' });
  if (await lock.isVisible().catch(() => false)) {
    await lock.click();
    await expect(lock).toHaveCount(0);
  }
});

async function expectNoHorizontalScroll(page, label) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${label}: page is wider than the screen`).toBeLessThanOrEqual(
    clientWidth + 1,
  );
  // The app scrolls inside its content pane: nothing in it may stick out sideways. Compared
  // by element position, because a classic scrollbar (desktop WebKit emulation) skews the
  // pane's own scrollWidth by the scrollbar width.
  const wide = await page.locator('#main-content').evaluate((el) => {
    const limit = el.getBoundingClientRect().left + el.clientWidth;
    // Content inside its own sideways scroller (tab strips, wide tables) is fine.
    const clipped = (node) => {
      for (let up = node.parentElement; up && up !== el; up = up.parentElement) {
        if (/auto|scroll|hidden|clip/.test(getComputedStyle(up).overflowX)) return true;
      }
      return false;
    };
    return [...el.querySelectorAll('*')]
      .filter((node) => node.getBoundingClientRect().right > limit + 1 && !clipped(node))
      .slice(0, 5)
      .map((node) => `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 40)}`);
  });
  expect(wide, `${label}: content sticks out sideways`).toEqual([]);
}

async function expectTapTarget(locator, label) {
  const box = await locator.boundingBox();
  expect(box, `${label}: not visible`).not.toBeNull();
  expect(box.width, `${label}: too narrow`).toBeGreaterThanOrEqual(44);
  expect(box.height, `${label}: too short`).toBeGreaterThanOrEqual(44);
}

test('core pages fit a 390 px phone and the navigation is reachable', async ({ page }) => {
  await createUser(page);
  await expectNoHorizontalScroll(page, 'first screen');
  await importDemoCsv(page);
  await expectNoHorizontalScroll(page, 'import');

  const nav = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(nav).toBeVisible();
  // The desktop sidebar is replaced by the bottom bar at this width.
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden();

  const hubs = [
    { link: 'Overview', url: /\/app$/, label: 'Overview' },
    { link: 'Activity', url: /\/app\/activity\/transactions$/, label: 'Transactions' },
    { link: 'Planning', url: /\/app\/planning\/budget$/, label: 'Budget' },
    { link: 'Accounts', url: /\/app\/accounts\/balances$/, label: 'Accounts' },
  ];
  for (const hub of hubs) {
    const link = nav.getByRole('link', { name: hub.link });
    await expectTapTarget(link, `${hub.link} tab`);
    await link.click();
    await expect(page).toHaveURL(hub.url);
    await expect(page.locator('#main-content').getByRole('heading').first()).toBeVisible();
    // Charts and tables settle after the first paint.
    await page.waitForTimeout(400);
    await expectNoHorizontalScroll(page, hub.label);
  }

  // Monthly sits in the Activity hub's tabs.
  await nav.getByRole('link', { name: 'Activity' }).click();
  await page.getByRole('link', { name: 'Monthly', exact: true }).first().click();
  await expect(page).toHaveURL(/\/app\/activity\/monthly$/);
  await page.waitForTimeout(400);
  await expectNoHorizontalScroll(page, 'Monthly');

  // Top-bar controls are finger-sized.
  await expectTapTarget(
    page.getByRole('button', { name: /Switch to (dark|light) theme/ }),
    'theme',
  );
  await expectTapTarget(page.getByRole('button', { name: 'Lock / Switch user' }), 'lock');
});
