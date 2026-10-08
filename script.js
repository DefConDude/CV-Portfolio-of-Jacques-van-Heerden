/****************************************************************/
/* Jacques van Heerden (35317906) - Responsive Detection       */
/****************************************************************/
/* Single source of truth for the layout mode. This query must match the
   book-view media query in style.css, otherwise the page-turn scripting
   would run against the stacked layout. */
const BOOK_LAYOUT_QUERY = '(min-width: 1024px) and (min-aspect-ratio: 1/1)';

const isBookLayout = () => window.matchMedia(BOOK_LAYOUT_QUERY).matches;

/****************************************************************/
/* Jacques van Heerden (35317906) - Page Registry               */
/****************************************************************/
const pages = Array.from(document.querySelectorAll('.book-page.page-right'));

/* The CSS flip transition is `transform 1s` on the pages and cover. The
   reference book (3D Portfolio Website) matched here deliberately does NOT wait
   the full second before restacking or before releasing the next page — that
   overlap is what gives the intro its flowing, rippling "fan" of pages rather
   than rigid one-at-a-time turns.

   RESTACK_MS: how long after a page starts flipping we update its z-index.
   The reference restacks at the halfway point (500ms); mid-flip the page is
   edge-on so the swap is invisible, and it keeps the cascade feeling light.

   STAGGER_MS: gap between the start of one page's flip and the next during a
   bulk open/close. The reference uses 200ms, so several pages are in motion at
   once and ripple over each other. This is the look to reproduce. */
const FLIP_MS = 1000;
const RESTACK_MS = 500;
const STAGGER_MS = 200;

/* A closed book stacks page 1 on top; an opened one stacks the last turned
   page on top. Separating the two keeps the arrows and the bulk animations
   from fighting over z-index. */
const closedZIndex = (index) => 10 + (pages.length - 1 - index);
/* Opened pages start at 21 so a turned page always sits ABOVE the profile
   spread (which rests at z-index 20). A tie let DOM order decide and could
   leave the profile's buttons unclickable behind a just-turned page. */
const openedZIndex = (index) => 21 + index;

function openPage(pageEl, index) {
    pageEl.classList.add('turn');
    setTimeout(() => {
        pageEl.style.zIndex = openedZIndex(index);
    }, RESTACK_MS);
}

function closePage(pageEl, index) {
    pageEl.classList.remove('turn');
    setTimeout(() => {
        pageEl.style.zIndex = closedZIndex(index);
    }, RESTACK_MS);
}

/****************************************************************/
/* Jacques van Heerden (35317906) - Page Turning Functions     */
/****************************************************************/
const pageTurnBtn = document.querySelectorAll('.nextprev-btn');

pageTurnBtn.forEach((el) => {
    const turnPage = () => {
        if (!isBookLayout()) return;

        const pageEl = document.getElementById(el.getAttribute('data-page'));
        if (!pageEl) return;

        const index = pages.indexOf(pageEl);
        if (index === -1) return;

        if (pageEl.classList.contains('turn')) {
            closePage(pageEl, index);
        } else {
            openPage(pageEl, index);
        }
    };

    el.addEventListener('click', turnPage);

    // The arrows are spans, so they need explicit keyboard handling.
    el.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
            event.preventDefault();
            turnPage();
        }
    });
});

/****************************************************************/
/* Jacques van Heerden (35317906) - Bulk Open / Close          */
/****************************************************************/
/* Opens every sheet in order, front to back, with a short 200ms stagger so the
   flips overlap into a flowing fan — matching the reference book. Returns the
   timestamp at which the last sheet has finished its full flip. */
function openBook(startDelay = 100) {
    pages.forEach((pageEl, index) => {
        setTimeout(() => openPage(pageEl, index), startDelay + (index + 1) * STAGGER_MS);
    });
    return startDelay + pages.length * STAGGER_MS + FLIP_MS;
}

/* Closes every sheet from the back forwards with the same 200ms stagger,
   ending on the profile spread. Walking a reversed copy avoids the index
   bookkeeping (the reference's double-decrement reverseIndex) that left pages
   stranded whenever the page count changed. Returns the timestamp at which the
   last sheet has finished its full flip. */
function closeBook(startDelay = 0) {
    pages
        .slice()
        .reverse()
        .forEach((pageEl, step) => {
            const index = pages.length - 1 - step;
            setTimeout(() => closePage(pageEl, index), startDelay + (step + 1) * STAGGER_MS);
        });

    return startDelay + pages.length * STAGGER_MS + FLIP_MS;
}

/****************************************************************/
/* Jacques van Heerden (35317906) - Contact Me Button          */
/****************************************************************/
const contactMeBtn = document.querySelector('.btn.contact-me');

if (contactMeBtn) {
    contactMeBtn.addEventListener('click', (event) => {
        // In the stacked layout the anchor should just scroll to the section.
        if (!isBookLayout()) return;
        event.preventDefault();
        openBook();
    });
}

/****************************************************************/
/* Jacques van Heerden (35317906) - Back to Profile Button     */
/****************************************************************/
const backProfileBtn = document.querySelector('.back-profile');

if (backProfileBtn) {
    backProfileBtn.addEventListener('click', (event) => {
        if (!isBookLayout()) return;
        event.preventDefault();
        closeBook();
    });
}

/****************************************************************/
/* Jacques van Heerden (35317906) - Opening Animations         */
/****************************************************************/
/* The markup ships with every page turned so the closed cover is all that
   shows on load. The fancy intro (cover opens, pages fan closed one at a time,
   land on the profile) is a lovely first impression but it takes several
   seconds and gets repetitive on every refresh. So we only play it once per
   browser session and skip straight to the open profile on later visits. */
const INTRO_SEEN_KEY = 'jvh-intro-played';

/* sessionStorage can throw in private mode or when storage is blocked, so both
   helpers fail safe: if we cannot read the flag we simply play the intro. */
function introAlreadyPlayed() {
    try {
        return sessionStorage.getItem(INTRO_SEEN_KEY) === '1';
    } catch (_) {
        return false;
    }
}

function markIntroPlayed() {
    try {
        sessionStorage.setItem(INTRO_SEEN_KEY, '1');
    } catch (_) {
        /* no-op: worst case the intro plays again next load */
    }
}

/* Snaps the book to the exact state the intro ends on — cover flipped out of
   the way, every sheet laid flat and restacked, profile on top — with no
   motion at all. Used on refreshes once the intro has been seen. */
function settleBookOpenInstantly(coverRight, pageLeft) {
    // `.skipped-intro` permanently disables the wrapper fade-in; `.skip-intro`
    // additionally freezes the flip transitions for the first frame(s) so
    // nothing animates while we jump to the final layout.
    document.documentElement.classList.add('skipped-intro', 'skip-intro');

    coverRight.classList.add('turn');
    coverRight.style.zIndex = '-1';

    pages.forEach((pageEl, index) => {
        pageEl.classList.remove('turn');
        pageEl.style.zIndex = closedZIndex(index);
    });

    pageLeft.style.zIndex = '20';

    // Re-enable the flip transitions on the next frame so manual page turns
    // still animate. The wrapper fade stays disabled via .skipped-intro.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            document.documentElement.classList.remove('skip-intro');
        });
    });
}

/* Plays the full choreographed intro, mirroring the reference book's timeline:
     - The cover flips open at 2100ms.
     - As the cover swings away it drops behind the pages at 2800ms.
     - The profile spread is raised just behind the opening pages at 3200ms.
     - The pages fan closed starting at 2300ms with a 200ms stagger, so their
       flips overlap the cover's and each other's into one flowing motion.
   Returns the timestamp at which the last page finishes its flip. */
function playIntro(coverRight, pageLeft) {
    const COVER_OPEN_AT = 2100;

    setTimeout(() => coverRight.classList.add('turn'), COVER_OPEN_AT);
    setTimeout(() => {
        coverRight.style.zIndex = -1;
    }, 2800);

    // Pages begin fanning closed just after the cover starts opening, with the
    // overlapping 200ms stagger that gives the reference its flowing motion.
    const settledAt = closeBook(COVER_OPEN_AT);

    // Raise the profile to the front only once every page has finished its
    // flip. The reference raised it early (3200ms, mid-flip) which let the
    // profile flash through a page still rotating over the left side — the
    // "jumps to home" glitch. Waiting until the pages have settled keeps the
    // same look without that artefact.
    setTimeout(() => {
        pageLeft.style.zIndex = 20;
    }, settledAt);

    return settledAt;
}

if (isBookLayout()) {
    const coverRight = document.querySelector('.cover.cover-right');
    const pageLeft = document.querySelector('.book-page.page-left');

    if (introAlreadyPlayed()) {
        settleBookOpenInstantly(coverRight, pageLeft);
    } else {
        playIntro(coverRight, pageLeft);
        markIntroPlayed();
    }
}
