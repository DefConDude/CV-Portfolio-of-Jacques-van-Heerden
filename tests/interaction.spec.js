/****************************************************************/
/* Jacques van Heerden (35317906) - Interaction Tests           */
/*                                                              */
/* The page-turn scripting and the CSS layout mode have to agree */
/* with each other, and turning a page must not break geometry.   */
/****************************************************************/
const { test, expect } = require('@playwright/test');
const { VIEWPORTS, openPortfolio, CHROME_SELECTOR, measurePageInBrowser } = require('./helpers');

const BOOK_VP = VIEWPORTS.find((v) => v.name === 'desktop-1440x900');
const MOBILE_VP = VIEWPORTS.find((v) => v.name === 'mobile-390x844');
const PORTRAIT_VP = VIEWPORTS.find((v) => v.name === 'tablet-portrait-820x1180');

const turnedIds = (page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.book-page.page-right'))
      .filter((el) => el.classList.contains('turn'))
      .map((el) => el.id)
  );

test.describe('book layout interactions', () => {
  test.beforeEach(async ({ page }) => {
    await openPortfolio(page, BOOK_VP, { flatten: false });
  });

  test('the intro sequence leaves every page closed and readable', async ({ page }) => {
    expect(await turnedIds(page)).toEqual([]);
    await expect(page.locator('.profile-page h2')).toBeVisible();
    await expect(page.locator('.wrapper')).toHaveCSS('opacity', '1');
  });

  test('the forward arrow turns its own page, and back returns it', async ({ page }) => {
    await page.locator('#turn-1 .page-front .next-btn').click();
    await expect(page.locator('#turn-1')).toHaveClass(/\bturn\b/);
    expect(await turnedIds(page)).toEqual(['turn-1']);

    await page.locator('#turn-1 .page-back .back').click();
    await expect(page.locator('#turn-1')).not.toHaveClass(/\bturn\b/);
    expect(await turnedIds(page)).toEqual([]);
  });

  test('pages can be turned all the way to the contact page', async ({ page }) => {
    for (const id of ['turn-1', 'turn-2', 'turn-3', 'turn-4']) {
      await page.locator(`#${id} .page-front .next-btn`).click();
      await expect(page.locator(`#${id}`)).toHaveClass(/\bturn\b/);
    }
    expect(await turnedIds(page)).toEqual(['turn-1', 'turn-2', 'turn-3', 'turn-4']);
    await expect(page.locator('#turn-4 .page-back .contact-box')).toBeVisible();
  });

  test('"Contact Me" opens the book to the contact page', async ({ page }) => {
    await page.locator('.btn.contact-me').click();
    await expect
      .poll(() => turnedIds(page), { timeout: 8000 })
      .toEqual(['turn-1', 'turn-2', 'turn-3', 'turn-4']);
  });

  test('"Profile" closes the book again', async ({ page }) => {
    await page.locator('.btn.contact-me').click();
    await expect.poll(() => turnedIds(page), { timeout: 8000 }).toHaveLength(4);

    await page.locator('.back-profile').click();
    await expect.poll(() => turnedIds(page), { timeout: 8000 }).toEqual([]);
  });

  test('turning a page does not break the layout of the page revealed', async ({ page }) => {
    await page.locator('#turn-1 .page-front .next-btn').click();
    await page.waitForTimeout(1200); // let the flip settle

    // Flatten only now, so the measurement is of the resting state.
    await page.addScriptTag({
      content: `window.__measurePage = ${measurePageInBrowser.toString()};`,
    });
    await page.addStyleTag({
      content: '.cover, .book-page, .page-front, .page-back { transition: none !important; }',
    });

    const m = await page.evaluate(
      ([sel, chrome]) => window.__measurePage(sel, chrome),
      ['#turn-2 .page-front', CHROME_SELECTOR]
    );
    expect(m.found).toBe(true);
    expect(m.content.bottom - m.chromeTop).toBeLessThanOrEqual(1);
  });

  test('no console errors while navigating', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.locator('#turn-1 .page-front .next-btn').click();
    await page.locator('.btn.contact-me').click();
    await page.waitForTimeout(1500);
    await page.locator('.back-profile').click();
    await page.waitForTimeout(1500);

    // Ignore font/CDN fetch noise, which says nothing about our code.
    const real = errors.filter((e) => !/net::|Failed to load resource|boxicons|fonts\.google/i.test(e));
    expect(real, `console errors: ${real.join(' | ')}`).toEqual([]);
  });
});

test.describe('stacked layout interactions', () => {
  for (const vp of [MOBILE_VP, PORTRAIT_VP]) {
    test(`${vp.name}: page-turn scripting stays out of the way`, async ({ page }) => {
      await openPortfolio(page, vp, { flatten: false });

      // The script must agree with the stylesheet about the layout mode.
      const scriptSaysBook = await page.evaluate(() => window.matchMedia(
        '(min-width: 1024px) and (min-aspect-ratio: 1/1)'
      ).matches);
      const cssSaysBook = await page.evaluate(
        () => getComputedStyle(document.querySelector('.cover')).display !== 'none'
      );
      expect(scriptSaysBook).toBe(false);
      expect(cssSaysBook).toBe(false);

      // The markup ships with the pages "turned" for the closed-book intro.
      // In the stacked layout that class must have no visual effect at all.
      const transforms = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.book-page.page-right')).map(
          (el) => getComputedStyle(el).transform
        )
      );
      for (const t of transforms) {
        expect(t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true);
      }

      // Content of every page is on screen in the flow, not hidden behind a flip.
      await expect(page.locator('#turn-4 .contact-box')).toBeVisible();
      await expect(page.locator('#turn-3 .project-box')).toBeVisible();
    });

    test(`${vp.name}: "Contact Me" scrolls to the contact section`, async ({ page }) => {
      await openPortfolio(page, vp, { flatten: false });
      const before = await page.evaluate(() => window.scrollY);
      await page.locator('.btn.contact-me').click();
      await page.waitForTimeout(600);
      const after = await page.evaluate(() => window.scrollY);
      expect(after, 'the page did not scroll towards the contact form').toBeGreaterThan(before);
    });
  }
});

test.describe('layout mode switching', () => {
  test('resizing from book to stacked keeps content visible', async ({ page }) => {
    await openPortfolio(page, BOOK_VP, { flatten: false });
    await page.locator('.btn.contact-me').click();
    await page.waitForTimeout(1500);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);

    await expect(page.locator('.profile-page h2')).toBeVisible();
    await expect(page.locator('#turn-1 .page-front .workeduc-box')).toBeVisible();
    await expect(page.locator('#turn-4 .page-back .contact-box')).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(391);
  });
});
