# CV Portfolio of Jacques van Heerden

An interactive, book-style portfolio for **Jacques van Heerden — Senior AI Engineer**.
Open `index.html` in a browser; there is no build step.

The content mirrors `Curriculum Vitae of Jacques van Heerden.pdf`, which the site
also offers for download.

## Layout

Two layouts, chosen by media query:

| Layout | Applies when | Behaviour |
| --- | --- | --- |
| Book | `min-width: 1024px` and `min-aspect-ratio: 1/1` | Two-page spread with 3D page turns |
| Stacked | anything narrower or portrait | Single scrolling column |

A two-page spread needs both width and height, so a portrait tablet gets the
stacked layout even though it is wider than a phone. The same media query lives
in `script.js` as `BOOK_LAYOUT_QUERY`; the two must stay in sync or the page-turn
scripting will run against the wrong layout.

Book pages are a fixed size, so each one holds its content in a `.page-content`
region that:

- reserves the strip used by the page number and turn arrows, and
- scales its type against the page's own size, using container queries where
  available and viewport units as a fallback, so a short laptop screen shrinks
  the text instead of overflowing.

If content ever exceeds a page anyway, `.page-content` scrolls rather than
spilling outside the book.

## Pages

1. Professional Experience — Mint Group, Scaled, Prime Meridian Direct, Backend IT
2. Earlier Career — IT Tech Services, Laerskool Kenmare, Vodacom, plus awards
3. Education & Qualifications
4. Skills
5. Flagship AI project — FNB Commercial Credit Review Agent
6. Brighton Medical System
7. Top 8 books
8. Contact

## Tests

The suite guards the two things most likely to go wrong: the CSS quietly
breaking the layout, and the portfolio drifting away from the CV.

```bash
npm install
npm run setup     # downloads the Chromium build Playwright uses
npm test
```

| Command | Covers |
| --- | --- |
| `npm run test:layout` | Overflow, containment and readability across 13 viewports |
| `npm run test:content` | Portfolio vs. the CV PDF, link/markup integrity, contrast, alt text |
| `npm run test:interaction` | Page turning, Contact Me / Profile, layout-mode switching |
| `npm run test:visual` | Pixel baselines for every page |
| `npm run test:report` | Opens the HTML report from the last run |

What the layout tests assert, per viewport:

- the document never scrolls sideways and nothing sits outside the viewport
- every page's content fits its page **without scrolling**, and clears the page
  number and turn arrows
- no text is clipped by an `overflow: hidden` ancestor
- no rendered text is below 10px
- the viewport-unit fallback (browsers without container queries) degrades to a
  scrollable page rather than losing content
- on stacked layouts: one column, no overlap, page-turn chrome hidden, tap
  targets at least 32px

`tests/content.spec.js` reads the CV PDF directly (via `pdfjs-dist`) and checks
both directions: every employer, qualification and contact detail on the CV
appears on the site, and the site does not assert anything the CV no longer
says. **Replacing the CV PDF will fail these tests until the pages are updated
to match** — that is the point.

### Visual baselines

Baselines live in `tests/visual.spec.js-snapshots/` and are committed. After an
intended design change, refresh them deliberately and review the diff:

```bash
npm run test:visual:update
```

They were generated on Chromium/Windows. Another OS will render text slightly
differently, so expect to regenerate on first use elsewhere.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | All eight pages plus the profile spread |
| `style.css` | Layout modes, page-relative type scale, components |
| `script.js` | Page turning, intro sequence, layout-mode detection |
| `tests/helpers.js` | Viewport list, page registry, geometry probe |
| `tests/cv-text.js` | Extracts text from the CV PDF for the content tests |

---

## Qualifications

### Education
- B.Sc. Information Technology, Cum Laude (North-West University, Class of 2026)
- Golden Key International Honour Society (2024)
- Matriculated — Hoërskool Noordheuwel (Class of 2015)

### International Qualifications
- Microsoft Certified: Azure AI Fundamentals (AI-900)
- Microsoft Certified: Azure Fundamentals
- ITIL v4 Foundations
- C# (C Sharp) Certification Course
- Cisco Certified Network Associate: Routing and Switching
- Fortinet: Network Security Expert 1 & 2
- CompTIA: A+ Computer Architecture
- Microsoft Certified Solutions Expert: Cloud Platform & Infrastructure
- Microsoft Certified Solutions Expert: Productivity
- Microsoft Certified Solutions Associate: Windows Server 2012
- Microsoft Specialist: Configuring Windows Devices
- Microsoft Technology Associate: Networking Fundamentals
- Microsoft Technology Associate: Security Fundamentals
- Microsoft Certified Professional
- Vodafone: Digital Business Essentials

### National Qualifications
- B.Sc. IT Degree (Golden Key Student) – Cum Laude
- Information Technology: Systems Support (NQF Level 5)
- Information Technology: Database Administration (NQF Level 6)

### Short Courses
- 2025 Cybersecurity Manager Training
- 2025 HIPAA Security and Privacy Training
- 2025 Cybersecurity Training
- Microsoft Word Fundamentals
- Kaseya Certified Administrator in IT Glue
- Certified Cyber Hero – ThreatLocker
- ConnectWise Certified PSA Engineer/Technician
- VSA Kaseya Certified Technician Program
- 2023 Cybersecurity Training
- 2023 HIPAA Manager Training
- Bringing ITSM and ITIL® to Life!
- Learn Ethical Hacking from Scratch 2024
- 2023 HIPAA Security and Privacy Training
- Google Cybersecurity Training
- Artificial Intelligence (AI) Cybersecurity Training
- Artificial Intelligence (AI) Fundamentals
- Microsoft Cybersecurity Training
- Certified Information Systems Security Professional CISSP
- DR – IT & BCP (Business Continuity Planning)
- Learn Python - Full Course for Beginners

### Awards
- **2021 — IT Performer of the Year:** Prime Meridian Direct
- **2024 — Golden Key International Honour Society:** North-West University
- **2024 — Team Player Award:** Scaled. Recognised for exceptional communication
  skills, a consistently uplifting attitude, and fostering a positive, cohesive
  team environment.
