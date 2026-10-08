/****************************************************************/
/* Jacques van Heerden (35317906) - Content & Structure Tests   */
/*                                                              */
/* Proves the portfolio still reflects the CV PDF it links to,   */
/* and that the markup around it stays sound.                    */
/****************************************************************/
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { PROJECT_ROOT, openPortfolio, VIEWPORTS, contrastRatio, parseColor } = require('./helpers');
const { CV_FILENAME, CV_PATH, extractCvText, normalise, squash } = require('./cv-text');

const DESKTOP = VIEWPORTS.find((v) => v.name === 'desktop-1440x900');

/** Everything on the CV that the portfolio is expected to surface. */
const CV_FACTS = {
  'current role': ['Senior AI Engineer'],
  'current employer': ['Mint Group'],
  'previous employers': [
    'Scaled',
    'Prime Meridian Direct',
    'Backend IT',
    'IT Tech Services',
    'Laerskool Kenmare',
    'Vodacom',
  ],
  'flagship project': ['FNB', 'Commercial Credit Review'],
  'project stack': ['OpenShift', 'PostgreSQL', 'Langfuse', 'Weaviate', 'SharePoint', 'OpenAI'],
  degree: ['B.Sc. Information Technology', 'Cum Laude', 'North-West University', 'Golden Key'],
  schooling: ['Noordheuwel'],
  certifications: [
    'AI-900',
    'Azure Fundamentals',
    'ITIL v4',
    'CCNA',
    'CompTIA A+',
    'Fortinet',
    'MCSE',
    'MCSA',
  ],
  'contact details': ['jvanheerden38@gmail.com', '83 652 9714'],
  'personal details': ['South African', 'Afrikaans', 'Code B', 'Passport'],
};

test.describe('CV PDF', () => {
  test('the downloadable CV exists and is readable', async () => {
    expect(fs.existsSync(CV_PATH), `${CV_FILENAME} is missing`).toBe(true);
    const cv = await extractCvText();
    expect(cv.numPages).toBeGreaterThan(0);
    expect(cv.flat.length, 'no text could be extracted from the CV').toBeGreaterThan(500);
    expect(cv.flat).toContain('Senior AI Engineer');
  });

  test('the download link points at the CV file that is present', async ({ page }) => {
    await openPortfolio(page, DESKTOP);
    const href = await page.getAttribute('a.btn[download]', 'href');
    expect(href, 'no download link found').toBeTruthy();
    const resolved = decodeURIComponent(href.replace(/^\.\//, ''));
    expect(resolved).toBe(CV_FILENAME);
    expect(fs.existsSync(path.join(PROJECT_ROOT, resolved))).toBe(true);
  });
});

test.describe('portfolio reflects the CV', () => {
  test.beforeEach(async ({ page }) => {
    await openPortfolio(page, DESKTOP);
  });

  for (const [group, phrases] of Object.entries(CV_FACTS)) {
    test(`${group} appear on the page`, async ({ page }) => {
      const pageText = normalise(await page.evaluate(() => document.body.innerText));
      const cv = await extractCvText();

      const missingFromPage = [];
      const missingFromCv = [];

      const cvSquashed = squash(cv.flat);

      for (const phrase of phrases) {
        const needle = normalise(phrase).toLowerCase();
        if (!pageText.toLowerCase().includes(needle)) missingFromPage.push(phrase);
        // Guard the other direction too: the portfolio should not keep claiming
        // things the CV no longer says.
        if (!cvSquashed.includes(squash(phrase))) missingFromCv.push(phrase);
      }

      expect(
        missingFromPage,
        `these ${group} are on the CV but not in the portfolio: ${missingFromPage.join(', ')}`
      ).toEqual([]);
      expect(
        missingFromCv,
        `these ${group} are asserted by the tests but no longer in the CV: ${missingFromCv.join(', ')}`
      ).toEqual([]);
    });
  }

  test('the headline role matches the CV', async ({ page }) => {
    const cv = await extractCvText();
    const heading = (await page.textContent('.profile-page h3')).trim();
    expect(squash(cv.flat)).toContain(squash(heading));
  });

  test('every employer on the CV appears in a timeline entry', async ({ page }) => {
    const cv = await extractCvText();
    const cvSquashed = squash(cv.flat);
    const employers = [
      'Mint Group',
      'Scaled',
      'Prime Meridian Direct',
      'Backend IT',
      'IT Tech Services',
      'Laerskool Kenmare',
      'Vodacom',
    ];
    const shown = squash(
      (
        await page.evaluate(() =>
          Array.from(document.querySelectorAll('.workeduc-content h3'))
            .map((el) => el.textContent)
            .join(' ')
        )
      )
    );
    const missing = employers.filter(
      (e) => cvSquashed.includes(squash(e)) && !shown.includes(squash(e))
    );
    expect(missing, `employers missing from the timeline: ${missing.join(', ')}`).toEqual([]);
  });
});

test.describe('document structure', () => {
  test.beforeEach(async ({ page }) => {
    await openPortfolio(page, DESKTOP);
  });

  test('page numbers are unique and sequential', async ({ page }) => {
    const numbers = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.number-page')).map((el) => el.textContent.trim())
    );
    expect(numbers).toEqual(numbers.map((_, i) => String(i + 1)));
  });

  test('every turning page has a front and a back', async ({ page }) => {
    const shape = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.book-page.page-right')).map((el) => ({
        id: el.id,
        fronts: el.querySelectorAll(':scope > .page-front').length,
        backs: el.querySelectorAll(':scope > .page-back').length,
      }))
    );
    expect(shape.length).toBeGreaterThan(0);
    for (const s of shape) {
      expect(s.fronts, `${s.id} should have exactly one front`).toBe(1);
      expect(s.backs, `${s.id} should have exactly one back`).toBe(1);
    }
  });

  test('every page holds its content in a .page-content region', async ({ page }) => {
    const missing = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.page-front, .page-back'))
        .filter((el) => el.querySelectorAll(':scope > .page-content').length !== 1)
        .map((el) => el.className)
    );
    expect(missing, `pages without a single .page-content wrapper: ${missing.join(', ')}`).toEqual([]);
  });

  test('every navigation button targets a page that exists', async ({ page }) => {
    const broken = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.nextprev-btn'))
        .map((el) => el.getAttribute('data-page'))
        .filter((id) => !id || !document.getElementById(id))
    );
    expect(broken, `nextprev-btn data-page values with no target: ${broken.join(', ')}`).toEqual([]);
  });

  test('internal anchor links resolve', async ({ page }) => {
    const broken = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href^="#"]'))
        .map((a) => a.getAttribute('href').slice(1))
        .filter((id) => id && !document.getElementById(id))
    );
    expect(broken, `anchors pointing nowhere: ${broken.join(', ')}`).toEqual([]);
  });

  test('there are no duplicate element ids', async ({ page }) => {
    const dupes = await page.evaluate(() => {
      const seen = new Map();
      for (const el of document.querySelectorAll('[id]')) {
        seen.set(el.id, (seen.get(el.id) || 0) + 1);
      }
      return [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    });
    expect(dupes, `duplicate ids: ${dupes.join(', ')}`).toEqual([]);
  });

  test('every boxicon name resolves to a real glyph', async ({ page }) => {
    const result = await page.evaluate(() => {
      // If the icon font never arrived, this tells us nothing about our markup.
      const fontLoaded = document.fonts.check('16px boxicons');
      const bad = Array.from(document.querySelectorAll('i.bx'))
        // Icons inside a display:none subtree (e.g. the mobile flip-book nav,
        // which is hidden on desktop) render no box; they can't be measured
        // here and are not what this test is about, so skip them — matching how
        // the layout specs skip hidden elements.
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => ({
          cls: el.className,
          content: getComputedStyle(el, '::before').content,
          width: el.getBoundingClientRect().width,
        }))
        .filter((x) => !x.content || x.content === 'none' || x.content === '""' || x.width < 4);
      return { fontLoaded, bad };
    });

    test.skip(!result.fontLoaded, 'boxicons font unavailable (offline)');
    expect(
      result.bad.map((b) => b.cls),
      `icon classes that render nothing: ${result.bad.map((b) => b.cls).join(', ')}`
    ).toEqual([]);
  });

  test('local image sources exist on disk and load', async ({ page }) => {
    const imgs = await page.evaluate(() =>
      Array.from(document.images).map((img) => ({
        src: img.getAttribute('src'),
        complete: img.complete,
        w: img.naturalWidth,
      }))
    );
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(fs.existsSync(path.join(PROJECT_ROOT, decodeURIComponent(img.src)))).toBe(true);
      expect(img.w, `${img.src} did not decode`).toBeGreaterThan(0);
    }
  });
});

test.describe('accessibility basics', () => {
  test.beforeEach(async ({ page }) => {
    await openPortfolio(page, DESKTOP);
  });

  test('images have alt text', async ({ page }) => {
    const missing = await page.evaluate(() =>
      Array.from(document.images)
        .filter((img) => !img.getAttribute('alt'))
        .map((img) => img.getAttribute('src'))
    );
    expect(missing, `images without alt text: ${missing.join(', ')}`).toEqual([]);
  });

  test('form fields are labelled', async ({ page }) => {
    const unlabelled = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input:not([type=submit]), textarea, select'))
        .filter((el) => {
          if (el.getAttribute('aria-label')) return false;
          if (el.id && document.querySelector(`label[for="${el.id}"]`)) return false;
          return !el.closest('label');
        })
        .map((el) => el.name || el.id || el.tagName)
    );
    expect(unlabelled, `unlabelled fields: ${unlabelled.join(', ')}`).toEqual([]);
  });

  test('icon-only links have an accessible name', async ({ page }) => {
    const nameless = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a'))
        .filter((a) => !a.textContent.trim() && !a.getAttribute('aria-label') && !a.getAttribute('title'))
        .map((a) => a.getAttribute('href'))
    );
    expect(nameless, `links with no accessible name: ${nameless.join(', ')}`).toEqual([]);
  });

  test('links opening a new tab are protected with rel=noopener', async ({ page }) => {
    const unsafe = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[target="_blank"]'))
        .filter((a) => !(a.getAttribute('rel') || '').includes('noopener'))
        .map((a) => a.getAttribute('href'))
    );
    expect(unsafe, `target=_blank without rel=noopener: ${unsafe.join(', ')}`).toEqual([]);
  });

  test('the document declares a language and a title', async ({ page }) => {
    expect(await page.getAttribute('html', 'lang')).toBeTruthy();
    expect((await page.title()).trim().length).toBeGreaterThan(0);
  });

  test('body text meets WCAG AA contrast against the page background', async ({ page }) => {
    const { stops, samples } = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const pages = root.getPropertyValue('--pages-color');
      const bg = root.getPropertyValue('--bg-color');
      const selectors = [
        '.profile-page p',
        '.profile-page h2',
        '.profile-page h3',
        '.workeduc-content p',
        '.workeduc-content h3',
        '.workeduc-content .year',
        '.services-content h3',
        '.skills-box-compact span',
        '.project-box .project-summary',
        '.project-box .project-points li',
        '.portfolio-box .info-box p',
        '.contact-details li',
        '.number-page',
      ];
      const samples = selectors
        .map((sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const cs = getComputedStyle(el);
          return {
            sel,
            color: cs.color,
            fontSize: parseFloat(cs.fontSize),
            bold: parseInt(cs.fontWeight, 10) >= 700,
          };
        })
        .filter(Boolean);
      return { stops: `${pages} ${bg}`, samples };
    });

    // Every hex colour that can sit behind text on a page.
    const backgrounds = (stops.match(/#[0-9a-f]{3,6}/gi) || []).map(parseColor).filter(Boolean);
    expect(backgrounds.length, 'could not resolve page background colours').toBeGreaterThan(0);

    const failures = [];
    for (const s of samples) {
      const fg = parseColor(s.color);
      if (!fg) continue;
      const worst = Math.min(...backgrounds.map((bg) => contrastRatio(fg, bg)));
      // WCAG AA: 3.0 for large text (>=18.66px bold or >=24px), else 4.5.
      const isLarge = s.fontSize >= 24 || (s.bold && s.fontSize >= 18.66);
      const required = isLarge ? 3 : 4.5;
      if (worst < required) {
        failures.push(`${s.sel} ${s.color} @${s.fontSize}px = ${worst.toFixed(2)}:1 (needs ${required})`);
      }
    }
    expect(failures, `contrast failures:\n${failures.join('\n')}`).toEqual([]);
  });
});
