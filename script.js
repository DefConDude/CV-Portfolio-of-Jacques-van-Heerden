/****************************************************************/
/* Jacques van Heerden (35317906) - Responsive Detection       */
/****************************************************************/
/* Single source of truth for the layout mode. This query must match the
   book-view media query in style.css, otherwise the page-turn scripting
   would run against the stacked layout. */
const BOOK_LAYOUT_QUERY = '(min-width: 1024px) and (min-aspect-ratio: 1/1)';

const isBookLayout = () => window.matchMedia(BOOK_LAYOUT_QUERY).matches;

/* The mobile single-page flip book and the small-viewport scroll-stack
   fallback. These two queries mirror the CSS media blocks exactly and, with
   BOOK_LAYOUT_QUERY, partition every viewport into exactly one mode.
   Keep these in sync with the matching @media blocks in style.css. */
const MOBILE_BOOK_QUERY =
    '(min-height: 480px) and (max-width: 1023px),' +
    '(min-height: 480px) and (max-aspect-ratio: 999/1000)';
const isMobileBookLayout = () => window.matchMedia(MOBILE_BOOK_QUERY).matches;

const SCROLL_FALLBACK_QUERY =
    '(max-height: 479px) and (max-width: 1023px),' +
    '(max-height: 479px) and (max-aspect-ratio: 999/1000)';
const isScrollFallback = () => window.matchMedia(SCROLL_FALLBACK_QUERY).matches;

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

/****************************************************************/
/* Jacques van Heerden (35317906) - Mobile Flip-Book Controller */
/****************************************************************/
/* A single-page 3D flip book for phones and portrait/narrow viewports. It
   shows one of nine reading surfaces at a time (profile + eight faces),
   driven by html[data-surface=0..8], with a rotateY page turn that reuses the
   desktop 1s cubic-bezier feel. Entirely gated behind isMobileBookLayout() so
   it is inert in the desktop-book and scroll-stack modes, mirroring the
   isBookLayout() gate above. */

/* Mirrors the desktop function-local COVER_OPEN_AT beat (which is unreachable
   for reuse); the auto-open fires at this delay on a first visit. */
const MOBILE_COVER_OPEN_AT = 2100;

if (isMobileBookLayout()) {
    const html = document.documentElement;

    // The nine surfaces in reading order — same selectors (and order) the
    // tests' BOOK_PAGES uses. Resolved once; nulls filtered defensively.
    const SURFACE_SELECTORS = [
        '.book-page.page-left',
        '#turn-1 .page-front',
        '#turn-1 .page-back',
        '#turn-2 .page-front',
        '#turn-2 .page-back',
        '#turn-3 .page-front',
        '#turn-3 .page-back',
        '#turn-4 .page-front',
        '#turn-4 .page-back',
    ];
    const surfaces = SURFACE_SELECTORS
        .map((sel) => document.querySelector(sel))
        .filter(Boolean);
    const TOTAL_SURFACES = surfaces.length;
    const LAST_INDEX = TOTAL_SURFACES - 1;

    const coverRight = document.querySelector('.cover.cover-right');
    const mobileNav = document.querySelector('.mobile-nav');
    const prevBtn = document.querySelector('.mnav-prev');
    const nextBtn = document.querySelector('.mnav-next');
    const homeBtn = document.querySelector('.mnav-home');
    const indicator = document.querySelector('.mobile-indicator');

    const SWIPE_THRESHOLD = 48;

    // Seed the current index from the pre-authored html[data-surface], clamped
    // to the surfaces that actually resolved.
    let currentIndex = Math.min(
        Math.max(parseInt(html.dataset.surface, 10) || 0, 0),
        Math.max(LAST_INDEX, 0)
    );
    let coverOpen = html.dataset.cover === 'open';
    let isAnimating = false;
    let autoOpenTimer = null;

    const prefersReducedMotion = () =>
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function render() {
        html.dataset.surface = String(currentIndex);

        if (indicator) {
            indicator.textContent = `${currentIndex + 1} / ${TOTAL_SURFACES}`;
        }

        // Toggle the end buttons. Before disabling the button that currently
        // holds focus, move focus to the always-enabled home button so a
        // keyboard user is never dropped to <body> (focus stays in the nav).
        if (prevBtn) {
            const disablePrev = currentIndex === 0;
            if (disablePrev && document.activeElement === prevBtn && homeBtn) {
                homeBtn.focus();
            }
            prevBtn.disabled = disablePrev;
        }
        if (nextBtn) {
            const disableNext = currentIndex === LAST_INDEX;
            if (disableNext && document.activeElement === nextBtn && homeBtn) {
                homeBtn.focus();
            }
            nextBtn.disabled = disableNext;
        }

        html.dataset.cover = coverOpen ? 'open' : (html.dataset.cover === 'opening' ? 'opening' : 'closed');
    }

    function goToSurface(target, direction) {
        if (!isMobileBookLayout()) return;
        if (isAnimating) return;
        if (target < 0 || target > LAST_INDEX) return;
        if (target === currentIndex) {
            render();
            return;
        }

        if (prefersReducedMotion()) {
            currentIndex = target;
            render();
            return;
        }

        isAnimating = true;
        const outgoing = surfaces[currentIndex];
        if (outgoing) outgoing.classList.add('flip-out');
        html.dataset.flip = direction;
        currentIndex = target;
        render();

        setTimeout(() => {
            delete html.dataset.flip;
            if (outgoing) outgoing.classList.remove('flip-out');
            isAnimating = false;
        }, FLIP_MS);
    }

    const next = () => goToSurface(currentIndex + 1, 'next');
    const prev = () => goToSurface(currentIndex - 1, 'prev');

    function openCover() {
        if (!isMobileBookLayout() || coverOpen) return;
        if (autoOpenTimer) {
            clearTimeout(autoOpenTimer);
            autoOpenTimer = null;
        }

        if (prefersReducedMotion()) {
            coverOpen = true;
            render();
            return;
        }

        isAnimating = true;
        html.dataset.cover = 'opening';
        setTimeout(() => {
            coverOpen = true;
            render();
            isAnimating = false;
        }, FLIP_MS);
    }

    /* ---- Input bindings ---- */

    // Cover tap / keyboard. The cover carries role="button"/tabindex/aria-label
    // in the HTML, so Enter and Space must also open it.
    if (coverRight) {
        coverRight.addEventListener('click', openCover);
        coverRight.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                event.preventDefault();
                openCover();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (!coverOpen) {
                openCover();
            } else {
                next();
            }
        });
    }
    if (prevBtn) prevBtn.addEventListener('click', prev);
    if (homeBtn) homeBtn.addEventListener('click', () => goToSurface(0, 'prev'));

    // Swipe — bound to .wrapper, the always-present ancestor of the cover, the
    // book and the nav. Pointer events bubble here regardless of which fixed
    // layer is on top, so a swipe is received even while the cover covers all.
    const wrapper = document.querySelector('.wrapper');
    if (wrapper) {
        let startX = null;
        let startY = null;

        wrapper.addEventListener('pointerdown', (event) => {
            startX = event.clientX;
            startY = event.clientY;
        });

        wrapper.addEventListener('pointerup', (event) => {
            if (startX === null) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            startX = null;
            startY = null;

            // Horizontal swipe only; ignore vertical scrolls of a tall surface.
            if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;

            if (!coverOpen) {
                openCover();
                return;
            }
            if (dx < 0) {
                next();
            } else {
                prev();
            }
        });
    }

    // Contact Me on mobile jumps straight to the contact surface (index 8).
    // The desktop handler on this same element early-returns off isBookLayout(),
    // so the two listeners never both act on one event.
    const contactMeBtnMobile = document.querySelector('.btn.contact-me');
    if (contactMeBtnMobile) {
        contactMeBtnMobile.addEventListener('click', (event) => {
            if (!isMobileBookLayout()) return;
            event.preventDefault();
            goToSurface(LAST_INDEX, 'next');
        });
    }

    /* ---- Intro gate (shared once-per-session key) ---- */
    if (introAlreadyPlayed()) {
        // Snap straight to the open profile, no cover animation.
        coverOpen = true;
        currentIndex = 0;
        render();
    } else {
        render();
        markIntroPlayed();
        if (prefersReducedMotion()) {
            coverOpen = true;
            render();
        } else {
            autoOpenTimer = setTimeout(openCover, MOBILE_COVER_OPEN_AT);
        }
    }
}
