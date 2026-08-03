/****************************************************************/
/* Jacques van Heerden (35317906) - Layout / CSS Sanity Tests   */
/*                                                              */
/* These tests exist to prove the stylesheet never lets content */
/* spill out of a page, collide with the navigation chrome, or   */
/* force the document to scroll sideways - the three ways this   */
/* layout can visibly break.                                    */
/****************************************************************/
const { test, expect } = require('@playwright/test');
const {
  VIEWPORTS,
  BOOK_PAGES,
  CHROME_SELECTOR,
  openPortfolio,
  measurePageInBrowser,
} = require('./helpers');

const TOLERANCE = 1; // sub-pixel rounding

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} (${viewport.mode})`, () => {
    test.beforeEach(async ({ page }) => {
      await openPortfolio(page, viewport);
    });

    test('document never scrolls horizontally', async ({ page }) => {
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(
        scrollWidth,
        `document is ${scrollWidth - innerWidth}px wider than the viewport`
      ).toBeLessThanOrEqual(innerWidth + TOLERANCE);
    });

    test('no element sticks out past the right edge of the viewport', async ({ page }) => {
      const offenders = await page.evaluate(() => {
        const bad = [];
        for (const el of document.body.querySelectorAll('*')) {
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden') continue;
          if (el.classList.contains('sr-only')) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          if (r.right > window.innerWidth + 1 || r.left < -1) {
            bad.push({
              tag: el.tagName.toLowerCase(),
              cls: typeof el.className === 'string' ? el.className : '',
              left: Math.round(r.left),
              right: Math.round(r.right),
            });
          }
        }
        return bad.slice(0, 10);
      });
      expect(offenders, `elements outside the viewport: ${JSON.stringify(offenders)}`).toEqual([]);
    });

    test('no text is clipped by an overflow:hidden ancestor', async ({ page }) => {
      const clipped = await page.evaluate(() => {
        const bad = [];
        for (const el of document.body.querySelectorAll('*')) {
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden') continue;
          // The project thumbnail intentionally crops its image on hover-zoom.
          if (el.classList.contains('img-box')) continue;
          if (el.classList.contains('sr-only')) continue;
          const text = (el.textContent || '').trim();
          if (!text) continue;

          // Only complain when the overflowing axis is *hidden*. auto/scroll
          // means the overflow is reachable, which is a different concern.
          const xHidden = s.overflowX === 'hidden' || s.overflowX === 'clip';
          const yHidden = s.overflowY === 'hidden' || s.overflowY === 'clip';
          const dx = el.scrollWidth - el.clientWidth;
          const dy = el.scrollHeight - el.clientHeight;

          if ((xHidden && dx > 1) || (yHidden && dy > 1)) {
            bad.push({
              cls: typeof el.className === 'string' ? el.className : '',
              text: text.slice(0, 40),
              overflowX: xHidden ? dx : 0,
              overflowY: yHidden ? dy : 0,
            });
          }
        }
        return bad.slice(0, 10);
      });
      expect(clipped, `clipped text: ${JSON.stringify(clipped)}`).toEqual([]);
    });

    test('every skill chip fits inside its fixed height', async ({ page }) => {
      const overflowing = await page.evaluate(() => {
        const bad = [];
        for (const el of document.querySelectorAll('.skills-box-compact span')) {
          if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) {
            bad.push({
              label: el.textContent.trim(),
              overflowH: el.scrollHeight - el.clientHeight,
              overflowW: el.scrollWidth - el.clientWidth,
            });
          }
        }
        return bad;
      });
      expect(
        overflowing,
        `skill labels taller or wider than their chip: ${JSON.stringify(overflowing)}`
      ).toEqual([]);
    });

    test('no rendered text is smaller than 10px', async ({ page }) => {
      const tiny = await page.evaluate(() => {
        const bad = [];
        for (const el of document.body.querySelectorAll('*')) {
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden') continue;
          if (el.classList.contains('sr-only')) continue;
          const ownText = Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent.trim())
            .join('');
          if (!ownText) continue;
          const size = parseFloat(s.fontSize);
          if (size < 10) bad.push({ text: ownText.slice(0, 30), size });
        }
        return bad;
      });
      expect(tiny, `text below 10px: ${JSON.stringify(tiny)}`).toEqual([]);
    });
  });
}

/****************************************************************/
/* Book-mode geometry: fixed-height pages must contain content   */
/****************************************************************/
for (const viewport of VIEWPORTS.filter((v) => v.mode === 'book')) {
  test.describe(`${viewport.name} page containment`, () => {
    test.beforeEach(async ({ page }) => {
      await openPortfolio(page, viewport);
    });

    for (const bookPage of BOOK_PAGES) {
      test(`"${bookPage.label}" fits without needing to scroll`, async ({ page }) => {
        const fit = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          return {
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
          };
        }, bookPage.scroller);

        expect(fit, `scroll container ${bookPage.scroller} not found`).not.toBeNull();

        const vertical = fit.scrollHeight - fit.clientHeight;
        const horizontal = fit.scrollWidth - fit.clientWidth;

        expect(
          vertical,
          `"${bookPage.label}" needs ${vertical}px more height than the page offers` +
            ` (${fit.scrollHeight} vs ${fit.clientHeight})`
        ).toBeLessThanOrEqual(TOLERANCE);
        expect(
          horizontal,
          `"${bookPage.label}" is ${horizontal}px too wide for the page`
        ).toBeLessThanOrEqual(TOLERANCE);
      });

      test(`"${bookPage.label}" content stays inside the page`, async ({ page }) => {
        const m = await page.evaluate(
          ([sel, chrome]) => {
            const fn = window.__measurePage;
            return fn(sel, chrome);
          },
          [bookPage.selector, CHROME_SELECTOR]
        );

        expect(m.found, `page ${bookPage.selector} not found`).toBe(true);
        expect(m.content, `page ${bookPage.label} rendered no content`).not.toBeNull();

        const overflowTop = m.box.top - m.content.top;
        const overflowBottom = m.content.bottom - m.box.bottom;
        const overflowLeft = m.box.left - m.content.left;
        const overflowRight = m.content.right - m.box.right;

        expect(
          overflowTop,
          `content overflows the top of "${bookPage.label}" by ${overflowTop.toFixed(1)}px`
        ).toBeLessThanOrEqual(TOLERANCE);
        expect(
          overflowLeft,
          `content overflows the left of "${bookPage.label}" by ${overflowLeft.toFixed(1)}px`
        ).toBeLessThanOrEqual(TOLERANCE);
        expect(
          overflowRight,
          `content overflows the right of "${bookPage.label}" by ${overflowRight.toFixed(1)}px` +
            ` (widest: ${JSON.stringify(m.widest)})`
        ).toBeLessThanOrEqual(TOLERANCE);
        expect(
          overflowBottom,
          `content overflows the bottom of "${bookPage.label}" by ${overflowBottom.toFixed(1)}px` +
            ` (lowest: ${JSON.stringify(m.tallest)})`
        ).toBeLessThanOrEqual(TOLERANCE);
      });

      if (bookPage.number) {
        test(`"${bookPage.label}" content clears the page navigation`, async ({ page }) => {
          const m = await page.evaluate(
            ([sel, chrome]) => window.__measurePage(sel, chrome),
            [bookPage.selector, CHROME_SELECTOR]
          );

          expect(m.chromeTop, `no navigation chrome on "${bookPage.label}"`).not.toBeNull();
          const encroachment = m.content.bottom - m.chromeTop;
          expect(
            encroachment,
            `content overlaps the page number / arrows on "${bookPage.label}"` +
              ` by ${encroachment.toFixed(1)}px`
          ).toBeLessThanOrEqual(TOLERANCE);
        });
      }
    }
  });
}

/****************************************************************/
/* The page-relative type scale is progressive enhancement. Older */
/* browsers fall back to viewport-relative rules, which cannot     */
/* know how wide a page is. There, a page may end up slightly      */
/* taller than its box - so the guarantee we hold them to is that   */
/* the overflow stays small AND stays reachable by scrolling,       */
/* never clipped away or spilled outside the book.                 */
/****************************************************************/
test.describe('without container query support', () => {
  const MAX_OVERFLOW_FRACTION = 0.08;

  for (const viewport of VIEWPORTS.filter((v) => v.mode === 'book')) {
    test(`${viewport.name}: fallback degrades to a scrollable page`, async ({ page }) => {
      await openPortfolio(page, viewport);
      // Leaving the container context discards every cq-based rule, so only the
      // vh/vw ones a legacy browser would apply are left.
      await page.addStyleTag({
        content: `.page-content, .book-page.page-left { container-type: normal !important; }`,
      });

      const report = await page.evaluate(
        (selectors) =>
          selectors
            .map(({ label, scroller }) => {
              const el = document.querySelector(scroller);
              if (!el) return null;
              const style = getComputedStyle(el);
              return {
                label,
                overflow: el.scrollHeight - el.clientHeight,
                height: el.clientHeight,
                scrollable: style.overflowY === 'auto' || style.overflowY === 'scroll',
              };
            })
            .filter(Boolean),
        BOOK_PAGES.map(({ label, scroller }) => ({ label, scroller }))
      );

      const unreachable = report.filter((r) => r.overflow > 1 && !r.scrollable);
      expect(
        unreachable.map((r) => r.label),
        `content would be cut off with no way to reach it: ${unreachable
          .map((r) => r.label)
          .join(', ')}`
      ).toEqual([]);

      const excessive = report.filter(
        (r) => r.overflow > r.height * MAX_OVERFLOW_FRACTION
      );
      expect(
        excessive.map((r) => `${r.label} +${r.overflow}px of ${r.height}px`),
        'a page overflows by more than 8% of its height on the fallback path'
      ).toEqual([]);
    });
  }
});

/****************************************************************/
/* Stacked (mobile) mode: everything flows in one readable column */
/****************************************************************/
for (const viewport of VIEWPORTS.filter((v) => v.mode === 'stacked')) {
  test.describe(`${viewport.name} stacked layout`, () => {
    test.beforeEach(async ({ page }) => {
      await openPortfolio(page, viewport);
    });

    test('the book collapses to a single column', async ({ page }) => {
      const lefts = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.book-page')).map(
          (el) => Math.round(el.getBoundingClientRect().left)
        )
      );
      expect(lefts.length).toBeGreaterThan(0);
      expect(new Set(lefts).size, `pages are not stacked: lefts=${lefts}`).toBe(1);
    });

    test('page-turn chrome is hidden', async ({ page }) => {
      for (const sel of ['.nextprev-btn', '.number-page', '.back-profile']) {
        const visible = await page.evaluate(
          (s) =>
            Array.from(document.querySelectorAll(s)).filter(
              (el) => getComputedStyle(el).display !== 'none'
            ).length,
          sel
        );
        expect(visible, `${sel} should be hidden on mobile`).toBe(0);
      }
    });

    test('every page is reachable by scrolling and has content', async ({ page }) => {
      const heights = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.page-front, .page-back, .profile-page')).map(
          (el) => ({
            cls: el.className,
            height: Math.round(el.getBoundingClientRect().height),
            text: el.textContent.trim().length,
          })
        )
      );
      for (const h of heights) {
        expect(h.height, `${h.cls} collapsed to ${h.height}px`).toBeGreaterThan(40);
        expect(h.text, `${h.cls} has no text`).toBeGreaterThan(0);
      }
    });

    test('interactive targets are large enough to tap', async ({ page }) => {
      const small = await page.evaluate(() => {
        const bad = [];
        const sel = 'a.btn, input[type="submit"], .social-media a, .contact-box .field';
        for (const el of document.querySelectorAll(sel)) {
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          if (r.height < 32 || r.width < 32) {
            bad.push({
              cls: typeof el.className === 'string' ? el.className : '',
              w: Math.round(r.width),
              h: Math.round(r.height),
            });
          }
        }
        return bad;
      });
      expect(small, `tap targets under 32px: ${JSON.stringify(small)}`).toEqual([]);
    });

    test('no two stacked sections overlap vertically', async ({ page }) => {
      const overlaps = await page.evaluate(() => {
        const pages = Array.from(document.querySelectorAll('.book-page')).map((el) => {
          const r = el.getBoundingClientRect();
          return { id: el.id || el.className, top: r.top, bottom: r.bottom };
        });
        const bad = [];
        for (let i = 1; i < pages.length; i++) {
          if (pages[i].top < pages[i - 1].bottom - 1) {
            bad.push([pages[i - 1].id, pages[i].id]);
          }
        }
        return bad;
      });
      expect(overlaps, `overlapping sections: ${JSON.stringify(overlaps)}`).toEqual([]);
    });
  });
}
