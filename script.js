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

/* How long the CSS flip takes, so z-index is only restacked once a page has
   finished moving. This MUST match the `transition: transform 1s ...` on
   .book-page.page-right / .cover.cover-right in style.css. Restacking before
   the flip finishes is what let pages show the wrong neighbour mid-turn. */
const FLIP_MS = 1000;

/* Gap between the START of one sheet's flip and the next.
   For a book-like, one-page-at-a-time turn each sheet should be most of the
   way through its flip before the next begins. A stagger shorter than the flip
   makes several sheets move together (the "5-4-3 all at once" glitch).

   The on-load intro is leisurely (80% of the flip) so it reads like slowly
   fanning a book open. The "Contact Me" / "Back to Profile" buttons are a
   deliberate user action, so they use a snappier stagger to feel responsive
   while still turning one page at a time. */
const INTRO_STAGGER_MS = Math.round(FLIP_MS * 0.8);
const BUTTON_STAGGER_MS = Math.round(FLIP_MS * 0.35);

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
    }, FLIP_MS);
}

function closePage(pageEl, index) {
    pageEl.classList.remove('turn');
    setTimeout(() => {
        pageEl.style.zIndex = closedZIndex(index);
    }, FLIP_MS);
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
/* Opens every sheet in order, front to back, one turn at a time so it reads
   like flipping through a real book. `stagger` controls the pace. Returns when
   the last sheet has settled. */
function openBook(startDelay = 100, stagger = INTRO_STAGGER_MS) {
    pages.forEach((pageEl, index) => {
        setTimeout(() => openPage(pageEl, index), startDelay + index * stagger);
    });
    return startDelay + (pages.length - 1) * stagger + FLIP_MS;
}

/* Closes every sheet from the back forwards, one turn at a time, ending on the
   profile spread. Walking a reversed copy avoids the index bookkeeping that
   previously left pages stranded whenever the page count changed. `stagger`
   controls the pace. Returns the timestamp at which the very last sheet has
   finished flipping and restacking, so callers can chain follow-up steps
   without guessing at a fixed delay. */
function closeBook(startDelay = 0, stagger = INTRO_STAGGER_MS) {
    pages
        .slice()
        .reverse()
        .forEach((pageEl, step) => {
            const index = pages.length - 1 - step;
            setTimeout(() => closePage(pageEl, index), startDelay + step * stagger);
        });

    // The last sheet starts flipping at startDelay + (n-1) * stagger and needs
    // FLIP_MS more to land and restack its z-index.
    return startDelay + (pages.length - 1) * stagger + FLIP_MS;
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
        openBook(100, BUTTON_STAGGER_MS);
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
        closeBook(0, BUTTON_STAGGER_MS);
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

/* Plays the full choreographed intro and returns the timestamp it settles at. */
function playIntro(coverRight, pageLeft) {
    /* Timeline, all derived from the flip constants so nothing drifts when the
       page count changes:
         1. The cover sits closed, then flips open.
         2. Once it has finished flipping it drops behind the pages.
         3. Only after the cover is clear do the pages start closing.
         4. The profile spread is raised to the front strictly AFTER every page
            has finished flipping closed. Raising it mid-flip is what used to
            pop the profile to the front and read as a "jump to home". */
    const COVER_OPEN_AT = 1400;
    const COVER_SETTLE_AT = COVER_OPEN_AT + FLIP_MS; // cover finished flipping
    const CLOSE_START_AT = COVER_SETTLE_AT;          // pages close after cover clears

    setTimeout(() => coverRight.classList.add('turn'), COVER_OPEN_AT);
    setTimeout(() => {
        coverRight.style.zIndex = -1;
    }, COVER_SETTLE_AT);

    const closeSettledAt = closeBook(CLOSE_START_AT);

    setTimeout(() => {
        pageLeft.style.zIndex = 20;
    }, closeSettledAt);

    return closeSettledAt;
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
