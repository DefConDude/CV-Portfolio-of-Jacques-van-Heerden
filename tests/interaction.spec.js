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
const FALLBACK_VP = VIEWPORTS.find((v) => v.name === 'mobile-landscape-667x375');

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

    // Turn a page forward with the arrow, then back — the everyday flow.
    await page.locator('#turn-1 .page-front .next-btn').click();
    await expect(page.locator('#turn-1')).toHaveClass(/\bturn\b/);
    await page.locator('#turn-1 .page-back .back').click();
    await expect(page.locator('#turn-1')).not.toHaveClass(/\bturn\b/);

    // From the profile, "Contact Me" fans every sheet open one at a time; let
    // it fully settle before driving the next action.
    await page.locator('.btn.contact-me').click();
    await page.waitForTimeout(2500);
    await expect(page.locator('#turn-4 .page-back .contact-box')).toBeVisible();

    // "Back to Profile" closes the whole book again.
    await page.locator('.back-profile').click();
    await page.waitForTimeout(2500);
    expect(await turnedIds(page)).toEqual([]);

    // Ignore font/CDN fetch noise, which says nothing about our code.
    const real = errors.filter((e) => !/net::|Failed to load resource|boxicons|fonts\.google/i.test(e));
    expect(real, `console errors: ${real.join(' | ')}`).toEqual([]);
  });
});

test.describe('mobile flip-book interactions', () => {
  for (const vp of [MOBILE_VP, PORTRAIT_VP]) {
    test(`${vp.name}: the flip-book controller is active and the cover is shown`, async ({ page }) => {
      await openPortfolio(page, vp, { flatten: false });

      // The script must agree with the stylesheet about the layout mode: this
      // is the mobile book, not the desktop two-page book.
      const scriptSaysBook = await page.evaluate(() => window.matchMedia(
        '(min-width: 1024px) and (min-aspect-ratio: 1/1)'
      ).matches);
      expect(scriptSaysBook).toBe(false);

      // Under the mobile book the cover is SHOWN (not display:none as it was in
      // the old scroll stack): it is the first thing a visitor sees.
      const coverShown = await page.evaluate(
        () => getComputedStyle(document.querySelector('.cover.cover-right')).display !== 'none'
      );
      expect(coverShown).toBe(true);

      // The controller is driving the surface model.
      const surface = await page.evaluate(() => document.documentElement.dataset.surface);
      expect(surface).toBe('0');
    });

    test(`${vp.name}: arrow controls turn pages after the cover opens`, async ({ page }) => {
      // Drop the once-per-session auto-open (setTimeout at 2100ms) so the cover
      // stays closed until this test taps it — deterministic under slow loads.
      await page.addInitScript(() => {
        const real = window.setTimeout.bind(window);
        window.setTimeout = (fn, delay, ...rest) => (delay === 2100 ? 0 : real(fn, delay, ...rest));
      });
      await openPortfolio(page, vp, { flatten: false });

      // Open the cover first (Next advances the cover when it is closed).
      await page.locator('.cover.cover-right').click();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.cover), { timeout: 3000 })
        .toBe('open');

      await page.locator('.mnav-next').click();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.surface), { timeout: 3000 })
        .toBe('1');
      // Let the flip settle (the controller drops gestures while animating).
      await page.waitForTimeout(1100);

      await page.locator('.mnav-prev').click();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.surface), { timeout: 3000 })
        .toBe('0');
    });
  }

  test(`${FALLBACK_VP.name}: "Contact Me" scrolls to the contact section`, async ({ page }) => {
    await openPortfolio(page, FALLBACK_VP, { flatten: false });
    const before = await page.evaluate(() => window.scrollY);
    await page.locator('.btn.contact-me').click();
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => window.scrollY);
    expect(after, 'the page did not scroll towards the contact form').toBeGreaterThan(before);
  });
});

test.describe('layout mode switching', () => {
  test('resizing from book to mobile shows exactly the profile surface', async ({ page }) => {
    await openPortfolio(page, BOOK_VP, { flatten: false });
    await page.locator('.btn.contact-me').click();
    await page.waitForTimeout(1500);

    // Resize into the mobile book and reload so the mobile controller
    // initialises in-mode and binds its handlers.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(
      () => {
        const s = document.documentElement.dataset.surface;
        return s !== undefined && s !== '';
      },
      null,
      { timeout: 15000 }
    );

    // The one-surface invariant: only the profile (surface 0) is visible; the
    // first and last faces are visibility:hidden at rest.
    await expect(page.locator('.profile-page h2')).toBeVisible();
    await expect(page.locator('#turn-1 .page-front')).toHaveCSS('visibility', 'hidden');
    await expect(page.locator('#turn-4 .page-back')).toHaveCSS('visibility', 'hidden');

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(391);
  });
});
