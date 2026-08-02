/****************************************************************/
/* Jacques van Heerden (35317906) - Visual Regression Tests     */
/*                                                              */
/* Pixel baselines for each page. The geometry tests prove       */
/* nothing overflows; these catch the subtler ways a stylesheet   */
/* change can make a page look wrong (spacing, colour, wrapping). */
/*                                                              */
/* Update deliberately after an intended design change:          */
/*   npm run test:visual:update                                  */
/****************************************************************/
const { test, expect } = require('@playwright/test');
const { VIEWPORTS, BOOK_PAGES, openPortfolio } = require('./helpers');

const BOOK_VP = VIEWPORTS.find((v) => v.name === 'desktop-1440x900');
const MOBILE_VP = VIEWPORTS.find((v) => v.name === 'mobile-390x844');

/**
 * Lays one leaf of the book flat and hides everything that would otherwise
 * paint over it, so a page can be captured deterministically without waiting
 * on the flip animation.
 */
function isolateCss(pageSelector) {
  const leafId = pageSelector.startsWith('#') ? pageSelector.split(' ')[0] : null;
  const face = pageSelector.includes('.page-front')
    ? '.page-front'
    : pageSelector.includes('.page-back')
      ? '.page-back'
      : null;

  return `
    *, *::before, *::after { animation: none !important; transition: none !important; }
    .wrapper { opacity: 1 !important; transform: none !important; }
    .cover { display: none !important; }
    .book-page, .page-front, .page-back { transform: none !important; }
    .page-front, .page-back { backface-visibility: visible !important; }
    ${leafId ? `.book-page.page-right:not(${leafId}) { display: none !important; }` : ''}
    ${leafId ? `.book-page.page-left { visibility: hidden !important; }` : ''}
    ${leafId && face === '.page-front' ? `${leafId} .page-back { display: none !important; }` : ''}
    ${leafId && face === '.page-back' ? `${leafId} .page-front { display: none !important; }` : ''}
    ${!leafId ? '.book-page.page-right { display: none !important; }' : ''}
  `;
}

test.describe('book pages look as expected', () => {
  for (const bookPage of BOOK_PAGES) {
    test(`${bookPage.label}`, async ({ page }) => {
      await openPortfolio(page, BOOK_VP);
      await page.addStyleTag({ content: isolateCss(bookPage.selector) });
      await expect(page.locator(bookPage.selector)).toHaveScreenshot(
        `page-${bookPage.label}.png`
      );
    });
  }
});

test.describe('assembled views', () => {
  test('closed book on the desktop', async ({ page }) => {
    await openPortfolio(page, BOOK_VP, { flatten: false });
    await expect(page.locator('.book')).toHaveScreenshot('book-closed.png');
  });

  test('opened to the contact page', async ({ page }) => {
    await openPortfolio(page, BOOK_VP, { flatten: false });
    await page.locator('.btn.contact-me').click();
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              Array.from(document.querySelectorAll('.book-page.page-right')).filter((el) =>
                el.classList.contains('turn')
              ).length
          ),
        { timeout: 10000 }
      )
      .toBe(4);
    await page.waitForTimeout(900); // let the last flip land
    await expect(page.locator('.book')).toHaveScreenshot('book-opened.png');
  });

  test('stacked layout on a phone', async ({ page }) => {
    await openPortfolio(page, MOBILE_VP);
    await expect(page).toHaveScreenshot('mobile-full.png', { fullPage: true });
  });
});
