/****************************************************************/
/* Jacques van Heerden (35317906) - Animation & Transition Tests */
/*                                                              */
/* These tests verify the intro sequence, page-flip transitions, */
/* hover states, and that animations complete without visual     */
/* artefacts or JS errors.                                      */
/****************************************************************/
const { test, expect } = require('@playwright/test');
const { VIEWPORTS, openPortfolio } = require('./helpers');

const BOOK_VP = VIEWPORTS.find((v) => v.name === 'desktop-1440x900');
const MOBILE_VP = VIEWPORTS.find((v) => v.name === 'mobile-390x844');

test.describe('intro animation sequence (book layout)', () => {
  test('the wrapper starts invisible and fades in', async ({ page }) => {
    await page.setViewportSize({ width: BOOK_VP.width, height: BOOK_VP.height });
    await page.goto(
      require('url').pathToFileURL(
        require('path').join(__dirname, '..', 'index.html')
      ).href,
      { waitUntil: 'domcontentloaded' }
    );

    // Immediately after load the wrapper should be invisible (opacity: 0 from animation)
    const initialOpacity = await page.evaluate(
      () => getComputedStyle(document.querySelector('.wrapper')).opacity
    );
    expect(Number(initialOpacity)).toBeLessThan(0.5);
  });

  test('the wrapper reaches full opacity after 2s', async ({ page }) => {
    await openPortfolio(page, BOOK_VP, { flatten: false });
    // openPortfolio waits for the intro to finish
    const opacity = await page.evaluate(
      () => getComputedStyle(document.querySelector('.wrapper')).opacity
    );
    expect(Number(opacity)).toBeCloseTo(1, 1);
  });

  test('the cover flips open during the intro', async ({ page }) => {
    await page.setViewportSize({ width: BOOK_VP.width, height: BOOK_VP.height });
    await page.goto(
      require('url').pathToFileURL(
        require('path').join(__dirname, '..', 'index.html')
      ).href,
      { waitUntil: 'load' }
    );

    // Wait for the cover to get the .turn class (happens at ~2.1s)
    await expect(page.locator('.cover.cover-right')).toHaveClass(/\bturn\b/, {
      timeout: 5000,
    });

    // After settling, the cover should have z-index -1 (behind everything)
    await page.waitForFunction(
      () => document.querySelector('.cover.cover-right').style.zIndex === '-1',
      null,
      { timeout: 5000 }
    );
  });

  test('all pages are laid flat (closed) after the intro finishes', async ({ page }) => {
    await openPortfolio(page, BOOK_VP, { flatten: false });

    const allClosed = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.book-page.page-right')).every(
        (el) => !el.classList.contains('turn')
      )
    );
    expect(allClosed, 'some pages are still turned after the intro').toBe(true);
  });

  test('no JS errors during the intro sequence', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.setViewportSize({ width: BOOK_VP.width, height: BOOK_VP.height });
    await page.goto(
      require('url').pathToFileURL(
        require('path').join(__dirname, '..', 'index.html')
      ).href,
      { waitUntil: 'load' }
    );
    // Let the full intro play out
    await page.waitForTimeout(5000);

    const real = errors.filter(
      (e) => !/net::|Failed to load resource|boxicons|fonts\.google/i.test(e)
    );
    expect(real, `JS errors during intro: ${real.join(' | ')}`).toEqual([]);
  });
});

test.describe('page-flip transitions', () => {
  test('flipping a page applies a CSS transform', async ({ page }) => {
    await openPortfolio(page, BOOK_VP, { flatten: false });

    // Click next on page 1
    await page.locator('#turn-1 .page-front .next-btn').click();
    // Right after clicking, the page should be mid-transform or fully turned
    await expect(page.locator('#turn-1')).toHaveClass(/\bturn\b/, { timeout: 3000 });

    // The transform should be a rotateY(-180deg) equivalent
    const transform = await page.evaluate(
      () => getComputedStyle(document.querySelector('#turn-1')).transform
    );
    // A turned page has a non-identity matrix (not "none")
    expect(transform).not.toBe('none');
  });

  test('the flip transition takes approximately 1s', async ({ page }) => {
    await openPortfolio(page, BOOK_VP, { flatten: false });

    const duration = await page.evaluate(() => {
      const el = document.querySelector('.book-page.page-right');
      return getComputedStyle(el).transitionDuration;
    });
    // Should be "1s" as defined in the CSS
    expect(duration).toBe('1s');
  });

  test('the flip uses a cubic-bezier easing (smooth, not linear)', async ({ page }) => {
    await openPortfolio(page, BOOK_VP, { flatten: false });

    const easing = await page.evaluate(() => {
      const el = document.querySelector('.book-page.page-right');
      return getComputedStyle(el).transitionTimingFunction;
    });
    // Should be the cubic-bezier from the CSS, not "linear" or "ease"
    expect(easing).toContain('cubic-bezier');
  });

  test('after a flip settles, the page has the correct z-index', async ({ page }) => {
    await openPortfolio(page, BOOK_VP, { flatten: false });

    await page.locator('#turn-1 .page-front .next-btn').click();
    // Wait for the flip to finish and z-index to update
    await page.waitForTimeout(1200);

    const zIndex = await page.evaluate(
      () => document.querySelector('#turn-1').style.zIndex
    );
    // Should be 20+ (opened stack)
    expect(Number(zIndex)).toBeGreaterThanOrEqual(20);
  });
});

test.describe('hover and focus states', () => {
  test('buttons change appearance on hover', async ({ page }) => {
    await openPortfolio(page, BOOK_VP, { flatten: false });

    const btn = page.locator('.profile-page .btn').first();
    const bgBefore = await btn.evaluate(
      (el) => getComputedStyle(el).backgroundColor
    );

    await btn.hover();
    await page.waitForTimeout(600); // let the transition play

    const bgAfter = await btn.evaluate(
      (el) => getComputedStyle(el).backgroundColor
    );
    expect(bgBefore).not.toBe(bgAfter);
  });

  test('social media icons have a hover transition', async ({ page }) => {
    await openPortfolio(page, BOOK_VP, { flatten: false });

    const icon = page.locator('.social-media a').first();
    const transition = await icon.evaluate(
      (el) => getComputedStyle(el).transitionDuration
    );
    // Should have a non-zero transition
    expect(transition).not.toBe('0s');

    const bgBefore = await icon.evaluate(
      (el) => getComputedStyle(el).backgroundColor
    );
    await icon.hover();
    await page.waitForTimeout(600);
    const bgAfter = await icon.evaluate(
      (el) => getComputedStyle(el).backgroundColor
    );
    expect(bgBefore).not.toBe(bgAfter);
  });

  test('navigation arrows scale on hover', async ({ page }) => {
    await openPortfolio(page, BOOK_VP, { flatten: false });

    // Open a page so arrows are visible
    await page.locator('#turn-1 .page-front .next-btn').click();
    await page.waitForTimeout(1200);

    const arrow = page.locator('#turn-1 .page-back .back');
    const transformBefore = await arrow.evaluate(
      (el) => getComputedStyle(el).transform
    );
    await arrow.hover();
    await page.waitForTimeout(400);
    const transformAfter = await arrow.evaluate(
      (el) => getComputedStyle(el).transform
    );
    // Should have changed (scale applied)
    expect(transformAfter).not.toBe(transformBefore);
  });
});

test.describe('mobile: no animations run', () => {
  test('wrapper has no animation on mobile', async ({ page }) => {
    await page.setViewportSize({ width: MOBILE_VP.width, height: MOBILE_VP.height });
    await page.goto(
      require('url').pathToFileURL(
        require('path').join(__dirname, '..', 'index.html')
      ).href,
      { waitUntil: 'load' }
    );
    await page.waitForTimeout(500);

    const anim = await page.evaluate(
      () => getComputedStyle(document.querySelector('.wrapper')).animationName
    );
    expect(anim === 'none' || anim === '').toBe(true);
  });

  test('pages have no 3D transforms on mobile', async ({ page }) => {
    await page.setViewportSize({ width: MOBILE_VP.width, height: MOBILE_VP.height });
    await page.goto(
      require('url').pathToFileURL(
        require('path').join(__dirname, '..', 'index.html')
      ).href,
      { waitUntil: 'load' }
    );

    const transforms = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.book-page')).map(
        (el) => getComputedStyle(el).transform
      )
    );
    for (const t of transforms) {
      expect(t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true);
    }
  });

  test('all content is immediately visible (no delayed reveal)', async ({ page }) => {
    await page.setViewportSize({ width: MOBILE_VP.width, height: MOBILE_VP.height });
    await page.goto(
      require('url').pathToFileURL(
        require('path').join(__dirname, '..', 'index.html')
      ).href,
      { waitUntil: 'load' }
    );
    await page.waitForTimeout(300);

    // The wrapper should be fully opaque immediately
    const opacity = await page.evaluate(
      () => getComputedStyle(document.querySelector('.wrapper')).opacity
    );
    expect(Number(opacity)).toBe(1);

    // Profile should be visible
    await expect(page.locator('.profile-page h2')).toBeVisible();
  });
});

test.describe('animation performance', () => {
  test('no layout shift during the intro (CLS = 0)', async ({ page }) => {
    await page.setViewportSize({ width: BOOK_VP.width, height: BOOK_VP.height });

    // Start observing layout shifts
    await page.goto(
      require('url').pathToFileURL(
        require('path').join(__dirname, '..', 'index.html')
      ).href,
      { waitUntil: 'load' }
    );

    // Inject a layout shift observer
    await page.evaluate(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__cls += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });

    // Let the full intro animation play
    await page.waitForTimeout(5000);

    const cls = await page.evaluate(() => window.__cls);
    // CLS should be essentially 0 — animations use transforms not layout
    expect(cls).toBeLessThan(0.05);
  });
});
