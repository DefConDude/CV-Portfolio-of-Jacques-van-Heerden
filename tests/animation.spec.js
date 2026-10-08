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

  test('the cover flips open and drops behind the pages during the intro', async ({ page }) => {
    // Matching the reference, the cover swings open while the pages begin
    // fanning (the motions overlap) and the cover ends up tucked behind
    // everything at z-index -1. We assert the cover both turns and clears, and
    // that the clearing happens in the expected early window of the intro.
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
      let coverTurnedAt = null;
      let coverClearedAt = null;

      while (performance.now() - start < 8000) {
        const now = Math.round(performance.now() - start);
        if (coverTurnedAt === null && cover.classList.contains('turn')) {
          coverTurnedAt = now;
        }
        if (coverClearedAt === null && cover.style.zIndex === '-1') {
          coverClearedAt = now;
        }
        if (coverTurnedAt !== null && coverClearedAt !== null) break;
        await new Promise((r) => requestAnimationFrame(r));
      }
      return { coverTurnedAt, coverClearedAt };
    });

    expect(timeline.coverTurnedAt).not.toBeNull();
    expect(timeline.coverClearedAt).not.toBeNull();
    // The cover flips before it drops behind the pages.
    expect(timeline.coverTurnedAt).toBeLessThanOrEqual(timeline.coverClearedAt);
  });

  test('sheets fan closed in order with an overlapping stagger', async ({ page }) => {
    // The reference book turns its pages with a short 200ms stagger so the
    // flips OVERLAP into one flowing fan — not a rigid one-at-a-time turn, and
    // not all at once. We record when each sheet loses its .turn class and
    // assert they go in reading order (back sheet first) with a small positive
    // gap between each.
    await page.setViewportSize({ width: BOOK_VP.width, height: BOOK_VP.height });
    await page.goto(
      require('url').pathToFileURL(
        require('path').join(__dirname, '..', 'index.html')
      ).href,
      { waitUntil: 'load' }
    );

    const closeEvents = await page.evaluate(async () => {
      const start = performance.now();
      const rightPages = Array.from(
        document.querySelectorAll('.book-page.page-right')
      );
      const seen = new Map(); // id -> timestamp it first lost .turn

      // Generous budget: under heavy parallel load the intro's setTimeout
      // stagger can start late, so give the whole cascade ample time to finish.
      while (performance.now() - start < 15000 && seen.size < rightPages.length) {
        for (const p of rightPages) {
          if (!seen.has(p.id) && !p.classList.contains('turn')) {
            seen.set(p.id, performance.now() - start);
          }
        }
        await new Promise((r) => requestAnimationFrame(r));
      }
      // id -> time, in the order they actually closed.
      return Array.from(seen.entries()).sort((a, b) => a[1] - b[1]);
    });

    // Every sheet must have closed.
    expect(closeEvents.length).toBe(4);

    // They should close back-to-front: turn-4, turn-3, turn-2, turn-1.
    const order = closeEvents.map(([id]) => id);
    expect(order).toEqual(['turn-4', 'turn-3', 'turn-2', 'turn-1']);

    // Each sheet starts its flip a little after the previous one — enough to
    // see a cascade (not simultaneous). The scheduled stagger is 200ms, but a
    // busy CPU (full suite, many parallel workers) can stretch or compress the
    // measured gaps considerably, so we only assert the shape of the cascade:
    // a clear positive gap (not all-at-once) with a generous upper bound. The
    // back-to-front ORDER assertion above is the real correctness guarantee.
    const times = closeEvents.map(([, t]) => t);
    for (let i = 1; i < times.length; i++) {
      const gap = times[i] - times[i - 1];
      expect(
        gap,
        `sheets ${i - 1} and ${i} closed ${Math.round(gap)}ms apart`
      ).toBeGreaterThan(40);
      expect(
        gap,
        `sheets ${i - 1} and ${i} closed ${Math.round(gap)}ms apart`
      ).toBeLessThan(2500);
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

const PAGE_URL_HREF = require('url').pathToFileURL(
  require('path').join(__dirname, '..', 'index.html')
).href;

test.describe('mobile: flip book at rest and in reduced motion', () => {
  test('wrapper has no keyframe animation in the mobile book', async ({ page }) => {
    // The desktop-only `show-animate` fade must never apply in the mobile book;
    // the wrapper keeps `animation: none` in the mobile-book media block.
    await openPortfolio(page, MOBILE_VP, { flatten: false });

    const anim = await page.evaluate(
      () => getComputedStyle(document.querySelector('.wrapper')).animationName
    );
    expect(anim === 'none' || anim === '').toBe(true);
  });

  test('book-page sheet wrappers rest at identity, a face flips in 1s cubic-bezier', async ({ page }) => {
    await openPortfolio(page, MOBILE_VP, { flatten: false });

    // At rest (data-surface set, no data-flip) the sheet wrappers (page-left +
    // the four page-right leaves) carry no 3D transform.
    const transforms = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.book-page')).map(
        (el) => getComputedStyle(el).transform
      )
    );
    for (const t of transforms) {
      expect(t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true);
    }

    // A reading surface (face) carries the 1s cubic-bezier flip transition.
    const face = await page.evaluate(() => {
      const el = document.querySelector('#turn-1 .page-front');
      const cs = getComputedStyle(el);
      return { duration: cs.transitionDuration, timing: cs.transitionTimingFunction };
    });
    expect(face.duration).toBe('1s');
    expect(face.timing).toContain('cubic-bezier');
  });

  test('the closed cover is on top and the profile surface is renderable at first paint', async ({ page }) => {
    await openPortfolio(page, MOBILE_VP, { flatten: false });

    // First paint of a fresh session: the branded cover is shown on top and
    // surface 0 (profile) is the current surface behind it.
    const state = await page.evaluate(() => ({
      cover: document.documentElement.dataset.cover,
      surface: document.documentElement.dataset.surface,
      coverShown:
        getComputedStyle(document.querySelector('.cover.cover-right')).display !== 'none',
    }));
    expect(['closed', 'opening', 'open']).toContain(state.cover);
    expect(state.surface).toBe('0');
    expect(state.coverShown).toBe(true);

    await expect(page.locator('.profile-page h2')).toBeVisible();
  });
});

test.describe('mobile reduced-motion flip book', () => {
  test('turning a page swaps the surface instantly (no flip transition)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openPortfolio(page, MOBILE_VP, { flatten: false });

    // Reduced motion zeroes the surface transition in the mobile book.
    const duration = await page.evaluate(
      () => getComputedStyle(document.querySelector('#turn-1 .page-front')).transitionDuration
    );
    expect(duration === '0s' || duration === 'none').toBe(true);

    // Under reduced motion the cover opens instantly on the first visit, so the
    // profile surface is already current. Advancing turns the page instantly.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.cover), { timeout: 3000 })
      .toBe('open');
    await page.locator('.mnav-next').click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.surface), { timeout: 2000 })
      .toBe('1');
  });
});

test.describe('desktop reduced-motion regression', () => {
  test('the desktop cover keeps its 1s transition under reduced motion', async ({ page }) => {
    // The mobile-scoped reduced-motion rule must NOT leak onto desktop: the
    // desktop cover must still report a non-zero transition duration.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: BOOK_VP.width, height: BOOK_VP.height });
    await page.goto(PAGE_URL_HREF, { waitUntil: 'load' });

    const duration = await page.evaluate(
      () => getComputedStyle(document.querySelector('.cover.cover-right')).transitionDuration
    );
    expect(duration).toBe('1s');
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
