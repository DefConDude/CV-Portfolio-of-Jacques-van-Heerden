/****************************************************************/
/* Jacques van Heerden (35317906) - Shared Test Helpers         */
/****************************************************************/
const path = require('path');
const { pathToFileURL } = require('url');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PAGE_URL = pathToFileURL(path.join(PROJECT_ROOT, 'index.html')).href;

/**
 * Viewports we care about. `book` viewports render the 3D two-page book
 * (min-width: 769px); `stacked` viewports render the single-column mobile
 * layout (max-width: 768px).
 */
const VIEWPORTS = [
  { name: 'desktop-1920x1080', width: 1920, height: 1080, mode: 'book' },
  { name: 'desktop-1440x900', width: 1440, height: 900, mode: 'book' },
  { name: 'laptop-1366x768', width: 1366, height: 768, mode: 'book' },
  { name: 'laptop-1280x720', width: 1280, height: 720, mode: 'book' },
  { name: 'tablet-landscape-1024x768', width: 1024, height: 768, mode: 'book' },
  { name: 'square-1200x1200', width: 1200, height: 1200, mode: 'book' },
  { name: 'square-1024x1024', width: 1024, height: 1024, mode: 'book' },
  // Narrow or portrait viewports fall back to the stacked layout: each page of
  // a two-page spread would be too narrow to read.
  { name: 'window-1000x1000', width: 1000, height: 1000, mode: 'stacked' },
  { name: 'tablet-portrait-820x1180', width: 820, height: 1180, mode: 'stacked' },
  { name: 'tablet-portrait-1024x1366', width: 1024, height: 1366, mode: 'stacked' },
  { name: 'tablet-768x1024', width: 768, height: 1024, mode: 'stacked' },
  { name: 'mobile-414x896', width: 414, height: 896, mode: 'stacked' },
  { name: 'mobile-390x844', width: 390, height: 844, mode: 'stacked' },
  { name: 'mobile-360x640', width: 360, height: 640, mode: 'stacked' },
  { name: 'mobile-320x568', width: 320, height: 568, mode: 'stacked' },
];

/**
 * The book animates in over ~3.3s and flips pages with 3D transforms. Rotated
 * elements report projected (squashed) bounding boxes, which makes geometry
 * assertions meaningless. This stylesheet flattens every page so each one can
 * be measured in the box it actually occupies when it is the visible page.
 */
const MEASUREMENT_MODE_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
  .wrapper { opacity: 1 !important; transform: none !important; }
  .cover, .book-page, .page-front, .page-back {
    transform: none !important;
  }
`;

/**
 * Load the portfolio at a given viewport and wait for webfonts / icon fonts so
 * that measured text metrics are the ones a real visitor sees.
 */
async function openPortfolio(page, viewport, { flatten = true } = {}) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(PAGE_URL, { waitUntil: 'load' });

  // Best effort: don't fail the suite if the CDN fonts are unreachable.
  await page
    .waitForFunction(() => document.fonts.status === 'complete', null, { timeout: 8000 })
    .catch(() => {});

  // Expose the geometry probe so specs can call window.__measurePage(...).
  await page.addScriptTag({
    content: `window.__measurePage = ${measurePageInBrowser.toString()};`,
  });

  if (flatten) {
    await page.addStyleTag({ content: MEASUREMENT_MODE_CSS });
  } else if (viewport.mode === 'book') {
    // Wait for the scripted intro to settle rather than sleeping for a fixed
    // period: the intro is done once every leaf is laid flat and restacked.
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('.book-page.page-right')).every(
          (el) => !el.classList.contains('turn') && el.style.zIndex !== ''
        ),
      null,
      { timeout: 15000 }
    );
    // One more frame so the flip transitions have finished painting.
    await page.waitForTimeout(300);
  } else {
    await page.waitForTimeout(200);
  }

  return page;
}

/**
 * Every measurable "page" of the book, in reading order, with the selector for
 * the element whose content box defines the usable area.
 */
const BOOK_PAGES = [
  {
    label: 'profile',
    selector: '.book-page.page-left',
    scroller: '.book-page.page-left',
    number: null,
  },
  {
    label: 'experience',
    selector: '#turn-1 .page-front',
    scroller: '#turn-1 .page-front .page-content',
    number: '1',
  },
  {
    label: 'earlier-career',
    selector: '#turn-1 .page-back',
    scroller: '#turn-1 .page-back .page-content',
    number: '2',
  },
  {
    label: 'education',
    selector: '#turn-2 .page-front',
    scroller: '#turn-2 .page-front .page-content',
    number: '3',
  },
  {
    label: 'skills',
    selector: '#turn-2 .page-back',
    scroller: '#turn-2 .page-back .page-content',
    number: '4',
  },
  {
    label: 'flagship-project',
    selector: '#turn-3 .page-front',
    scroller: '#turn-3 .page-front .page-content',
    number: '5',
  },
  {
    label: 'brighton-project',
    selector: '#turn-3 .page-back',
    scroller: '#turn-3 .page-back .page-content',
    number: '6',
  },
  {
    label: 'books',
    selector: '#turn-4 .page-front',
    scroller: '#turn-4 .page-front .page-content',
    number: '7',
  },
  {
    label: 'contact',
    selector: '#turn-4 .page-back',
    scroller: '#turn-4 .page-back .page-content',
    number: '8',
  },
];

const CHROME_SELECTOR = '.number-page, .nextprev-btn, .back-profile';

/**
 * Runs in the browser. Returns the container's content box, the union of all
 * visible content descendants, and the topmost edge of the fixed page
 * "chrome" (page number + navigation arrows) so we can prove content never
 * runs into it.
 */
function measurePageInBrowser(selector, chromeSelector) {
  const container = document.querySelector(selector);
  if (!container) return { found: false };

  const cs = getComputedStyle(container);
  const rect = container.getBoundingClientRect();
  const box = {
    top: rect.top + parseFloat(cs.paddingTop),
    bottom: rect.bottom - parseFloat(cs.paddingBottom),
    left: rect.left + parseFloat(cs.paddingLeft),
    right: rect.right - parseFloat(cs.paddingRight),
  };

  const chromeNodes = Array.from(container.querySelectorAll(chromeSelector));
  const isChrome = (el) => chromeNodes.some((c) => c === el || c.contains(el));

  let content = null;
  let widest = null;
  let tallest = null;

  for (const el of container.querySelectorAll('*')) {
    if (isChrome(el)) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (el.classList.contains('sr-only')) continue;

    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;

    if (!content) {
      content = { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    } else {
      content.top = Math.min(content.top, r.top);
      content.bottom = Math.max(content.bottom, r.bottom);
      content.left = Math.min(content.left, r.left);
      content.right = Math.max(content.right, r.right);
    }

    if (r.right > box.right + 1 && (!widest || r.right > widest.right)) {
      widest = { tag: el.tagName, cls: el.className, right: r.right };
    }
    if (r.bottom > box.bottom + 1 && (!tallest || r.bottom > tallest.bottom)) {
      tallest = { tag: el.tagName, cls: el.className, bottom: r.bottom };
    }
  }

  let chromeTop = null;
  for (const c of chromeNodes) {
    const style = getComputedStyle(c);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const r = c.getBoundingClientRect();
    chromeTop = chromeTop === null ? r.top : Math.min(chromeTop, r.top);
  }

  return { found: true, box, content, chromeTop, widest, tallest };
}

/** Relative luminance of an [r,g,b] triple (0-255). */
function luminance([r, g, b]) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio between two [r,g,b] triples. */
function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

/** Parses `#rgb`, `#rrggbb`, `rgb()` and `rgba()` into [r,g,b]. */
function parseColor(value) {
  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1];
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  }
  const rgb = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

module.exports = {
  PROJECT_ROOT,
  PAGE_URL,
  VIEWPORTS,
  BOOK_PAGES,
  CHROME_SELECTOR,
  MEASUREMENT_MODE_CSS,
  openPortfolio,
  measurePageInBrowser,
  contrastRatio,
  parseColor,
};
