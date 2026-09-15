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

/* Gap between the START of one sheet's flip and the next during the intro.
   For a book-like, one-page-at-a-time turn each sheet should be most of the
   way through its flip before the next begins. A stagger shorter than the flip
   makes several sheets move together (the "5-4-3 all at once" glitch), so we
   let each flip nearly finish (80%) before releasing the next one. */
const INTRO_STAGGER_MS = Math.round(FLIP_MS * 0.8);

/* A closed book stacks page 1 on top; an opened one stacks the last turned
   page on top. Separating the two keeps the arrows and the bulk animations
   from fighting over z-index. */
const closedZIndex = (index) => 10 + (pages.length - 1 - index);
const openedZIndex = (index) => 20 + index;

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
   like flipping through a real book. Returns when the last sheet has settled. */
function openBook(startDelay = 100) {
    pages.forEach((pageEl, index) => {
        setTimeout(() => openPage(pageEl, index), startDelay + index * INTRO_STAGGER_MS);
    });
    return startDelay + (pages.length - 1) * INTRO_STAGGER_MS + FLIP_MS;
}

/* Closes every sheet from the back forwards, one turn at a time, ending on the
   profile spread. Walking a reversed copy avoids the index bookkeeping that
   previously left pages stranded whenever the page count changed. Returns the
   timestamp at which the very last sheet has finished flipping and restacking,
   so callers can chain follow-up steps without guessing at a fixed delay. */
function closeBook(startDelay = 0) {
    pages
        .slice()
        .reverse()
        .forEach((pageEl, step) => {
            const index = pages.length - 1 - step;
            setTimeout(() => closePage(pageEl, index), startDelay + step * INTRO_STAGGER_MS);
        });

    // The last sheet starts flipping at startDelay + (n-1) * INTRO_STAGGER_MS
    // and needs FLIP_MS more to land and restack its z-index.
    return startDelay + (pages.length - 1) * INTRO_STAGGER_MS + FLIP_MS;
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
   shows on load. The intro then opens the cover and lays the pages down. */
if (isBookLayout()) {
    const coverRight = document.querySelector('.cover.cover-right');
    const pageLeft = document.querySelector('.book-page.page-left');

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
}
