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

  test('the profile is never raised to the front while pages are still flipping closed', async ({ page }) => {
    // Regression for the reported glitch: after the 3rd/4th page turn during
    // load the book "jumped to the home page". That happened because the
    // profile spread (page-left) was promoted to z-index 20 on a fixed timer
    // that fired while the last pages were still mid-flip. We now derive that
    // moment from the close sequence, so the profile must only come forward
    // once EVERY right-hand page has finished flipping closed.
    await page.setViewportSize({ width: BOOK_VP.width, height: BOOK_VP.height });
    await page.goto(
      require('url').pathToFileURL(
        require('path').join(__dirname, '..', 'index.html')
      ).href,
      { waitUntil: 'load' }
    );

    // Sample the DOM ~60x/sec through the whole intro, recording whenever the
    // profile is at the front (z-index 20) while any page still carries .turn.
    const violations = await page.evaluate(async () => {
      const found = [];
      const start = performance.now();
      const pageLeft = document.querySelector('.book-page.page-left');
      const rightPages = Array.from(
        document.querySelectorAll('.book-page.page-right')
      );

      while (performance.now() - start < 8000) {
        const profileZ = Number(pageLeft.style.zIndex || 0);
        const stillTurning = rightPages.filter((p) =>
          p.classList.contains('turn')
        );
        if (profileZ >= 20 && stillTurning.length > 0) {
          found.push({
            t: Math.round(performance.now() - start),
            turning: stillTurning.map((p) => p.id),
          });
        }
        await new Promise((r) => requestAnimationFrame(r));
      }
      return found;
    });

    expect(
      violations,
      `profile came to the front mid-flip: ${JSON.stringify(violations.slice(0, 5))}`
    ).toEqual([]);
  });

  test('the cover has cleared before the pages start closing', async ({ page }) => {
    // The pages should only begin closing once the cover has dropped behind
    // them, otherwise the cover briefly paints over a closing page.
    await page.setViewportSize({ width: BOOK_VP.width, height: BOOK_VP.height });
    await page.goto(
      require('url').pathToFileURL(
        require('path').join(__dirname, '..', 'index.html')
      ).href,
      { waitUntil: 'load' }
    );

    const timeline = await page.evaluate(async () => {
      const start = performance.now();
      const cover = document.querySelector('.cover.cover-right');
      const rightPages = Array.from(
        document.querySelectorAll('.book-page.page-right')
      );
      let coverClearedAt = null;
      let firstCloseAt = null;

      while (performance.now() - start < 8000) {
        const now = Math.round(performance.now() - start);
        if (coverClearedAt === null && cover.style.zIndex === '-1') {
          coverClearedAt = now;
        }
        // A page "starts closing" the first time it loses its .turn class.
        if (
          firstCloseAt === null &&
          rightPages.some((p) => !p.classList.contains('turn'))
        ) {
          firstCloseAt = now;
        }
        if (coverClearedAt !== null && firstCloseAt !== null) break;
        await new Promise((r) => requestAnimationFrame(r));
      }
      return { coverClearedAt, firstCloseAt };
    });

    expect(timeline.coverClearedAt).not.toBeNull();
    expect(timeline.firstCloseAt).not.toBeNull();
    // Cover must be clear at or before the first page begins closing.
    expect(timeline.coverClearedAt).toBeLessThanOrEqual(timeline.firstCloseAt);
  });

  test('sheets close one at a time, not several at once', async ({ page }) => {
    // Regression for "8, 7, then 5-4-3 all together, then skips to 1". Each
    // sheet must be well into its own flip before the next one starts, so the
    // intro reads like turning pages in a real book. We record the moment each
    // sheet loses its .turn class and assert those moments are spaced out by a
    // healthy fraction of the flip duration rather than firing on top of each
    // other.
    await page.setViewportSize({ width: BOOK_VP.width, height: BOOK_VP.height });
    await page.goto(
      require('url').pathToFileURL(
        require('path').join(__dirname, '..', 'index.html')
      ).href,
      { waitUntil: 'load' }
    );

    const closeTimes = await page.evaluate(async () => {
      const start = performance.now();
      const rightPages = Array.from(
        document.querySelectorAll('.book-page.page-right')
      );
      const seen = new Map(); // id -> timestamp it first lost .turn

      while (performance.now() - start < 8000 && seen.size < rightPages.length) {
        for (const p of rightPages) {
          if (!seen.has(p.id) && !p.classList.contains('turn')) {
            seen.set(p.id, performance.now() - start);
          }
        }
        await new Promise((r) => requestAnimationFrame(r));
      }
      // Return the close timestamps sorted in the order they happened.
      return Array.from(seen.values()).sort((a, b) => a - b);
    });

    // Every sheet must have closed.
    expect(closeTimes.length).toBe(4);

    // Consecutive closes must be spaced. The flip is 1s; sequential turns are
    // staggered at ~0.8s. Under parallel test load rAF sampling can miss the
    // exact frame a sheet flips, which only ever makes a measured gap look
    // SMALLER than reality — so we assert a conservative floor of 300ms. The
    // broken "all at once" cascade spaced sheets ~0-200ms apart, so 300ms
    // still catches that regression while tolerating sampling jitter.
    for (let i = 1; i < closeTimes.length; i++) {
      const gap = closeTimes[i] - closeTimes[i - 1];
      expect(
        gap,
        `sheets ${i - 1} and ${i} closed only ${Math.round(gap)}ms apart`
      ).toBeGreaterThan(300);
    }
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
    await page.waitForTimeout(7000);

    const real = errors.filter(
      (e) => !/net::|Failed to load resource|boxicons|fonts\.google/i.test(e)
    );
    expect(real, `JS errors during intro: ${real.join(' | ')}`).toEqual([]);
  });
});

test.describe('intro plays once per session', () => {
  const pageUrl = require('url').pathToFileURL(
    require('path').join(__dirname, '..', 'index.html')
  ).href;

  test('a fresh session plays the full intro (wrapper starts hidden)', async ({ page }) => {
    await page.setViewportSize({ width: BOOK_VP.width, height: BOOK_VP.height });
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });

    // On the very first visit the wrapper fades in from opacity 0.
    const initialOpacity = await page.evaluate(
      () => getComputedStyle(document.querySelector('.wrapper')).opacity
    );
    expect(Number(initialOpacity)).toBeLessThan(0.5);

    // And the session flag gets set so later loads skip the intro.
    const flag = await page.evaluate(() =>
      sessionStorage.getItem('jvh-intro-played')
    );
    expect(flag).toBe('1');
  });

  test('reloading in the same session skips the intro and opens instantly', async ({ page }) => {
    await page.setViewportSize({ width: BOOK_VP.width, height: BOOK_VP.height });

    // First visit: play the intro through to the end.
    await page.goto(pageUrl, { waitUntil: 'load' });
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('.book-page.page-right')).every(
          (el) => !el.classList.contains('turn') && el.style.zIndex !== ''
        ),
      null,
      { timeout: 15000 }
    );

    // Reload: sessionStorage persists across a reload, so the intro is skipped.
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Almost immediately the book should already be open on the profile: the
    // wrapper is fully visible and every sheet is laid flat with no flipping.
    await page.waitForTimeout(150);

    const state = await page.evaluate(() => ({
      opacity: Number(getComputedStyle(document.querySelector('.wrapper')).opacity),
      anyTurned: Array.from(
        document.querySelectorAll('.book-page.page-right')
      ).some((el) => el.classList.contains('turn')),
      profileZ: Number(
        document.querySelector('.book-page.page-left').style.zIndex || 0
      ),
      coverZ: document.querySelector('.cover.cover-right').style.zIndex,
    }));

    expect(state.opacity).toBeGreaterThan(0.9); // no slow fade-in
    expect(state.anyTurned).toBe(false); // pages already laid flat
    expect(state.profileZ).toBe(20); // profile already on top
    expect(state.coverZ).toBe('-1'); // cover already tucked away
  });

  test('the skip path settles without a long delay', async ({ page }) => {
    await page.setViewportSize({ width: BOOK_VP.width, height: BOOK_VP.height });

    // Prime the session flag directly, then load once.
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => sessionStorage.setItem('jvh-intro-played', '1'));
    await page.reload({ waitUntil: 'domcontentloaded' });

    // The full choreographed intro takes ~5.8s; the skip path must be settled
    // far sooner. Give it a generous 500ms and require it to already be open.
    await page.waitForTimeout(500);
    const anyTurned = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.book-page.page-right')).some((el) =>
        el.classList.contains('turn')
      )
    );
    expect(anyTurned).toBe(false);
  });

  test('manual page turns still animate after the skip path', async ({ page }) => {
    await page.setViewportSize({ width: BOOK_VP.width, height: BOOK_VP.height });

    await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => sessionStorage.setItem('jvh-intro-played', '1'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(300); // let .skip-intro clear

    // The transition must be restored (not frozen at "none") so clicking an
    // arrow still flips the page smoothly.
    const duration = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('.book-page.page-right'))
          .transitionDuration
    );
    expect(duration).toBe('1s');
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
    await page.waitForTimeout(7000);

    const cls = await page.evaluate(() => window.__cls);
    // CLS should be essentially 0 — animations use transforms not layout
    expect(cls).toBeLessThan(0.05);
  });
});
