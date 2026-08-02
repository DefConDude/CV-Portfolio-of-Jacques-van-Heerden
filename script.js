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
   finished moving. Keep in sync with the transition on .book-page.page-right. */
const FLIP_MS = 500;
const STAGGER_MS = 200;

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
/* Opens every page in order, front to back, so the book ends on the last page. */
function openBook(startDelay = 100) {
    pages.forEach((pageEl, index) => {
        setTimeout(() => openPage(pageEl, index), startDelay + (index + 1) * STAGGER_MS);
    });
}

/* Closes every page from the back forwards, ending on the profile spread.
   Walking a reversed copy avoids the index bookkeeping that previously left
   pages stranded whenever the page count changed. */
function closeBook(startDelay = 0) {
    pages
        .slice()
        .reverse()
        .forEach((pageEl, step) => {
            const index = pages.length - 1 - step;
            setTimeout(() => closePage(pageEl, index), startDelay + (step + 1) * STAGGER_MS);
        });
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

    setTimeout(() => coverRight.classList.add('turn'), 2100);
    setTimeout(() => {
        coverRight.style.zIndex = -1;
    }, 2800);

    setTimeout(() => {
        pageLeft.style.zIndex = 20;
    }, 3200);

    closeBook(2100);
}
