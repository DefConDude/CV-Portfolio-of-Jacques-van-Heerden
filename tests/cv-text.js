/****************************************************************/
/* Jacques van Heerden (35317906) - CV PDF Text Extraction      */
/*                                                              */
/* Reads the CV that the site offers for download so tests can   */
/* compare the portfolio against the actual source document.     */
/****************************************************************/
const fs = require('fs');
const path = require('path');

const CV_FILENAME = 'Curriculum Vitae of Jacques van Heerden.pdf';
const CV_PATH = path.resolve(__dirname, '..', CV_FILENAME);

let cached = null;

/** Collapses whitespace so comparisons ignore PDF line-wrapping. */
function normalise(text) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2010-\u2015]/g, '-') // en/em dashes -> hyphen
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractCvText() {
  if (cached) return cached;

  // pdfjs ships as ESM; the legacy build runs under plain Node.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(CV_PATH));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const pdfPage = await doc.getPage(i);
    const content = await pdfPage.getTextContent();
    out += content.items.map((item) => item.str).join(' ') + '\n';
  }
  await doc.destroy();

  cached = { raw: out, flat: normalise(out), numPages: doc.numPages };
  return cached;
}

/**
 * PDF text extraction is not word-accurate: pdfjs reports "Gol den Key" and
 * "North - West" because it emits one item per glyph run. Squashing to bare
 * alphanumerics makes phrase lookups survive that.
 */
function squash(text) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

module.exports = { CV_FILENAME, CV_PATH, extractCvText, normalise, squash };
