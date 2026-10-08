/****************************************************************/
/* Jacques van Heerden (35317906) - Mobile Flip-Book Tests      */
/*                                                              */
/* Behavioural coverage for the single-page 3D flip book: cover  */
/* open (tap/swipe/keyboard), swipe + button page turns, the one- */
/* surface invariant, the indicator, back-to-profile, the once-   */
/* per-session skip, reduced motion, the Contact Me jump, focus    */
/* safety at the ends, and the Download CV link + contact form.    */
/*                                                              */
/* All waits derive from the named animation constants so the      */
/* suite is non-flaky; polling absorbs requestAnimationFrame      */
/* jitter under parallel load. Behavioural flip/gesture tests     */
/* open the portfolio with { flatten: false }.                   */
/****************************************************************/
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('url');
const { PROJECT_ROOT, VIEWPORTS, openPortfolio } = require('./helpers');

const PAGE_URL = pathToFileURL(path.join(PROJECT_ROOT, 'index.html')).href;

// Mirror the script.js constants; all waits are derived from these.
const FLIP_MS = 1000;
const MOBILE_COVER_OPEN_AT = 2100;
const SETTLE = FLIP_MS + 1500; // generous poll ceiling for a single flip

const MOBILE_VP = VIEWPORTS.find((v) => v.name === 'mobile-390x844');
const PORTRAIT_VP = VIEWPORTS.find((v) => v.name === 'tablet-portrait-820x1180');

const SURFACE_SELECTORS = [
  '.book-page.page-left',
  '#turn-1 .page-front',
  '#turn-1 .page-back',
  '#turn-2 .page-front',
  '#turn-2 .page-back',
  '#turn-3 .page-front',
  '#turn-3 .page-back',
  '#turn-4 .page-front',
  '#turn-4 .page-back',
];

const surfaceAttr = (page) =>
  page.evaluate(() => document.documentElement.dataset.surface);
const coverAttr = (page) =>
  page.evaluate(() => document.documentElement.dataset.cover);

/** Drive a horizontal swipe across the viewport via Pointer Events. */
async function swipe(page, viewport, direction) {
  const y = Math.round(viewport.height / 2);
  const fromX = direction === 'left' ? Math.round(viewport.width * 0.8) : Math.round(viewport.width * 0.2);
  const toX = direction === 'left' ? Math.round(viewport.width * 0.2) : Math.round(viewport.width * 0.8);
  await page.mouse.move(fromX, y);
  await page.mouse.down();
  await page.mouse.move(Math.round((fromX + toX) / 2), y);
  await page.mouse.move(toX, y);
  await page.mouse.up();
}

/**
 * Suppress the once-per-session auto-open so the cover stays closed until the
 * test drives it. The controller schedules the auto-open with
 * setTimeout(openCover, MOBILE_COVER_OPEN_AT); we drop exactly that timer so
 * the "tap/swipe/keyboard opens the cover" assertions are deterministic and
 * never race the 2100ms beat during slow font loads. All other timers (the
 * FLIP_MS flip cleanup) are untouched.
 */
async function suppressAutoOpen(page) {
  await page.addInitScript((openAt) => {
    const realSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (fn, delay, ...rest) => {
      if (delay === openAt) return 0;
      return realSetTimeout(fn, delay, ...rest);
    };
  }, MOBILE_COVER_OPEN_AT);
}

/** Open the cover to the profile surface and wait for it to settle open. */
async function openCover(page) {
  await page.locator('.cover.cover-right').click();
  await expect.poll(() => coverAttr(page), { timeout: SETTLE }).toBe('open');
}

for (const viewport of [MOBILE_VP, PORTRAIT_VP]) {
  test.describe(`${viewport.name} flip book`, () => {
    test.beforeEach(async ({ page }) => {
      // Keep the cover closed until the test opens it (drop the auto-open beat).
      await suppressAutoOpen(page);
    });

    test('the branded cover opens on tap', async ({ page }) => {
      await openPortfolio(page, viewport, { flatten: false });
      expect(await coverAttr(page)).not.toBe('open');
      await openCover(page);
      expect(await surfaceAttr(page)).toBe('0');
      await expect(page.locator('.profile-page h2')).toBeVisible();
    });

    test('the cover opens on a horizontal swipe', async ({ page }) => {
      await openPortfolio(page, viewport, { flatten: false });
      await swipe(page, viewport, 'left');
      await expect.poll(() => coverAttr(page), { timeout: SETTLE }).toBe('open');
    });

    test('the cover opens on keyboard activation (Enter)', async ({ page }) => {
      await openPortfolio(page, viewport, { flatten: false });
      await page.locator('.cover.cover-right').focus();
      await page.keyboard.press('Enter');
      await expect.poll(() => coverAttr(page), { timeout: SETTLE }).toBe('open');
    });

    test('swipe left advances and swipe right returns a page', async ({ page }) => {
      await openPortfolio(page, viewport, { flatten: false });
      await openCover(page);

      await swipe(page, viewport, 'left');
      await expect.poll(() => surfaceAttr(page), { timeout: SETTLE }).toBe('1');
      await page.waitForTimeout(FLIP_MS); // let the flip settle before the next gesture

      await swipe(page, viewport, 'right');
      await expect.poll(() => surfaceAttr(page), { timeout: SETTLE }).toBe('0');
    });

    test('the arrow buttons turn pages', async ({ page }) => {
      await openPortfolio(page, viewport, { flatten: false });
      await openCover(page);

      await page.locator('.mnav-next').click();
      await expect.poll(() => surfaceAttr(page), { timeout: SETTLE }).toBe('1');
      await page.waitForTimeout(FLIP_MS);

      await page.locator('.mnav-next').click();
      await expect.poll(() => surfaceAttr(page), { timeout: SETTLE }).toBe('2');
      await page.waitForTimeout(FLIP_MS);

      await page.locator('.mnav-prev').click();
      await expect.poll(() => surfaceAttr(page), { timeout: SETTLE }).toBe('1');
    });

    test('exactly one surface is visible after a turn', async ({ page }) => {
      await openPortfolio(page, viewport, { flatten: false });
      await openCover(page);
      await page.locator('.mnav-next').click();
      await expect.poll(() => surfaceAttr(page), { timeout: SETTLE }).toBe('1');
      await page.waitForTimeout(FLIP_MS);

      const visibleCount = await page.evaluate((selectors) => {
        let count = 0;
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          if (cs.visibility !== 'hidden' && r.width > 0 && r.height > 0) count++;
        }
        return count;
      }, SURFACE_SELECTORS);
      expect(visibleCount).toBe(1);
    });

    test('the indicator reflects the current position out of 9', async ({ page }) => {
      await openPortfolio(page, viewport, { flatten: false });
      await openCover(page);
      await expect(page.locator('.mobile-indicator')).toHaveText('1 / 9');

      await page.locator('.mnav-next').click();
      await expect.poll(() => surfaceAttr(page), { timeout: SETTLE }).toBe('1');
      await expect(page.locator('.mobile-indicator')).toHaveText('2 / 9');
    });

    test('back-to-profile returns to the first surface from anywhere', async ({ page }) => {
      await openPortfolio(page, viewport, { flatten: false });
      await openCover(page);

      await page.locator('.mnav-next').click();
      await expect.poll(() => surfaceAttr(page), { timeout: SETTLE }).toBe('1');
      await page.waitForTimeout(FLIP_MS);
      await page.locator('.mnav-next').click();
      await expect.poll(() => surfaceAttr(page), { timeout: SETTLE }).toBe('2');
      await page.waitForTimeout(FLIP_MS);

      await page.locator('.mnav-home').click();
      await expect.poll(() => surfaceAttr(page), { timeout: SETTLE }).toBe('0');
      await expect(page.locator('.mobile-indicator')).toHaveText('1 / 9');
    });

    test('next on the last surface and prev on the first are no-ops without errors', async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));

      await openPortfolio(page, viewport, { flatten: false });
      await openCover(page);

      // prev on the first surface: no change, button disabled.
      await expect(page.locator('.mnav-prev')).toBeDisabled();
      expect(await surfaceAttr(page)).toBe('0');

      // Jump to the last surface via Contact Me, then try to advance past it.
      await page.locator('.btn.contact-me').click();
      await expect.poll(() => surfaceAttr(page), { timeout: SETTLE }).toBe('8');
      await expect(page.locator('.mnav-next')).toBeDisabled();

      expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
    });

    test('Contact Me jumps straight to the contact surface', async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));

      await openPortfolio(page, viewport, { flatten: false });
      await openCover(page);

      await page.locator('.btn.contact-me').click();
      await expect.poll(() => surfaceAttr(page), { timeout: SETTLE }).toBe('8');

      // The anchor jump was suppressed (no #turn-4 in the URL).
      const hash = await page.evaluate(() => location.hash);
      expect(hash).not.toBe('#turn-4');
      await expect(page.locator('.mobile-indicator')).toHaveText('9 / 9');
      expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
    });

    test('the Download CV link is present and functional', async ({ page }) => {
      await openPortfolio(page, viewport, { flatten: false });
      const href = await page.getAttribute('a.btn[download]', 'href');
      expect(href, 'no download link found').toBeTruthy();
      const resolved = decodeURIComponent(href.replace(/^\.\//, ''));
      expect(fs.existsSync(path.join(PROJECT_ROOT, resolved))).toBe(true);
    });

    test('the contact form is present and reachable on the contact surface', async ({ page }) => {
      await openPortfolio(page, viewport, { flatten: false });
      await openCover(page);
      await page.locator('.btn.contact-me').click();
      await expect.poll(() => surfaceAttr(page), { timeout: SETTLE }).toBe('8');

      const form = page.locator('#turn-4 .page-back form');
      await expect(form).toHaveAttribute('action', 'https://formspree.io/f/xvgqkwkz');
      await expect(form).toHaveAttribute('method', /post/i);
      await expect(page.locator('#turn-4 .page-back input[name="name"]')).toBeVisible();
      await expect(page.locator('#turn-4 .page-back input[name="_replyto"]')).toBeVisible();
      await expect(page.locator('#turn-4 .page-back textarea[name="message"]')).toBeVisible();
      await expect(page.locator('#turn-4 .page-back input[type="submit"]')).toBeVisible();
    });

    test('keyboard focus stays within the nav when the Next end is reached', async ({ page }) => {
      await openPortfolio(page, viewport, { flatten: false });
      await openCover(page);

      // Drive to the last surface via the keyboard on the Next button.
      await page.locator('.mnav-next').focus();
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Enter');
        await expect
          .poll(() => surfaceAttr(page), { timeout: SETTLE })
          .toBe(String(Math.min(i + 1, 8)));
        await page.waitForTimeout(FLIP_MS);
      }
      expect(await surfaceAttr(page)).toBe('8');

      // Next is now disabled; focus must have moved to a nav control (home),
      // not been dropped to <body>.
      const activeInNav = await page.evaluate(
        () => !!document.activeElement.closest('.mobile-nav')
      );
      expect(activeInNav).toBe(true);
    });
  });
}

test.describe('once-per-session skip on reload', () => {
  test('a first visit auto-opens the cover and later loads snap straight open', async ({ page }) => {
    await openPortfolio(page, MOBILE_VP, { flatten: false });

    // The session flag is set at init (mirrors desktop).
    const flag = await page.evaluate(() => sessionStorage.getItem('jvh-intro-played'));
    expect(flag).toBe('1');

    // Wait past the auto-open beat; the cover opens on its own.
    await page.waitForTimeout(MOBILE_COVER_OPEN_AT + FLIP_MS + 300);
    expect(await coverAttr(page)).toBe('open');

    // Reload in the same session: snaps straight to the open profile, no flip.
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(200);
    expect(await coverAttr(page)).toBe('open');
    expect(await surfaceAttr(page)).toBe('0');
  });
});

test.describe('reduced motion', () => {
  test('the cover opens and pages swap instantly, controls still work', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openPortfolio(page, MOBILE_VP, { flatten: false });

    // With reduced motion the cover is open immediately on the first visit.
    await expect.poll(() => coverAttr(page), { timeout: SETTLE }).toBe('open');

    await page.locator('.mnav-next').click();
    await expect.poll(() => surfaceAttr(page), { timeout: SETTLE }).toBe('1');
    await expect(page.locator('.mobile-indicator')).toHaveText('2 / 9');
    await page.waitForTimeout(FLIP_MS); // settle in case the environment ignores reduced motion

    await page.locator('.mnav-home').click();
    await expect.poll(() => surfaceAttr(page), { timeout: SETTLE }).toBe('0');
  });
});
