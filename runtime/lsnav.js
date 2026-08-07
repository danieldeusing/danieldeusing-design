/*
 * lsnav.js — show/hide for the `ls -l` site rail (src/chrome.css).
 *
 * Markup contract:
 *   <div class="ls-nav" id="nav">
 *     <div class="ls-nav-head">
 *       <span class="ls-nav-title">ls -l</span>
 *       <button class="ls-nav-hide" data-ls-nav-toggle aria-controls="nav" aria-expanded="true">»</button>
 *     </div>
 *     <ul class="ls-panel">…</ul>
 *   </div>
 *   <button class="ls-nav-show" data-ls-nav-toggle aria-controls="nav">« ls -l</button>
 *
 * THIS MODULE DOES NOT APPLY THE INITIAL STATE, and that is deliberate. It is a
 * module at the end of <body>, so anything it does happens after first paint: a
 * reader who hid the rail would watch it paint and then jump away on every page
 * load. The state is applied by an inline <head> script instead —
 *
 *   try { if (localStorage.getItem("ls-nav") === "off")
 *           document.documentElement.dataset.lsNav = "off"; } catch {}
 *
 * — and this module only reads that, wires the clicks, and writes back. Shown is
 * the default, so an absent key and a failed read both land on "shown", which is
 * the state that is correct when in doubt.
 *
 * Every [data-ls-nav-toggle] toggles, so the hide button inside the rail and the
 * tab that replaces it share one handler and one aria-expanded truth.
 */
const KEY = "ls-nav";

/*
 * The rail runs BETWEEN the chrome — it must not cover the header bar or the
 * status footer. Their heights are a consumer's business and change with the
 * viewport, so they are measured here and published as --ls-nav-top /
 * --ls-nav-bottom rather than guessed at in CSS. chrome.css carries fallbacks,
 * so a page that never runs this still lays out sensibly.
 *
 * Keeping `ls -l` at one fixed spot is the point: the rail's head and the tab
 * that replaces it share --ls-nav-top, so opening and closing changes the arrow
 * and nothing else moves.
 */
function measureChrome() {
  const root = document.documentElement;
  const bar = document.querySelector("header.bar");
  const status = document.querySelector("footer.status");
  // THE RAIL'S TOP IS THE HEADER'S BOTTOM EDGE, NOT THE HEADER'S HEIGHT. Those are the same
  // number only when nothing sits above the header — and something does: cockpit's alerts.js
  // mounts the alert banner as the FIRST CHILD OF BODY. Measured with a 73px banner, the header
  // ran 73→118 while --ls-nav-top was set to 44 (its height, minus the overlap), so the rail
  // started 74px too high, inside the banner, with the `ls -l` head and its toggle buried
  // underneath it. Reported as "the sidebar is broken, I cannot hide it any more".
  //
  // getBoundingClientRect().bottom is the only thing that answers "where does the header END on
  // screen", and it has to be VIEWPORT-relative because the rail is position:fixed. The comment
  // this replaces was right that rects are VISUAL px and a CSS length is re-multiplied by any
  // ancestor `zoom` — so the answer is to divide by the zoom, not to avoid the rect. Reading a
  // height to answer a position question is what made the banner invisible to this code.
  const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1;
  const h = (el) => (el ? el.offsetHeight : 0);
  // OVERLAP BY 1px rather than trying to meet the chrome exactly. offsetHeight is an
  // INTEGER while the bar's real height is fractional (44.97), so "exactly flush" is
  // a rounding coin-flip — and under a zoomed layout the error is multiplied: at
  // zoom 1.25 the bar ended at 56.00 and a 45px inset put the rail at 56.25, a
  // quarter-pixel seam of page background that is plainly visible on a wide screen.
  // Both chrome elements are opaque and sit ABOVE the rail (z-index 30 and 50 vs 25),
  // so a pixel of tuck is invisible, whereas a pixel of gap is not.
  if (bar) {
    root.style.setProperty("--ls-nav-top", `${Math.max(0, bar.getBoundingClientRect().bottom / zoom - 1)}px`);
  }
  // A hidden footer (mobile folds it into the burger) reserves nothing.
  root.style.setProperty("--ls-nav-bottom", `${Math.max(0, h(status) - 1)}px`);
}

export function initLsNav() {
  const root = document.documentElement;
  const toggles = document.querySelectorAll("[data-ls-nav-toggle]");
  if (!toggles.length) return;

  measureChrome();
  addEventListener("resize", measureChrome);
  // A sticky header's bottom edge MOVES while anything above it scrolls away: with the banner
  // on screen it sits at banner+header, and once the banner is gone it sits at header. A height
  // never changed, so this listener was never needed before.
  addEventListener("scroll", measureChrome, { passive: true });
  // The bar reflows when webfonts land, which changes its height after first paint.
  if (document.fonts?.ready) document.fonts.ready.then(measureChrome).catch(() => {});

  const shown = () => root.dataset.lsNav !== "off";
  const sync = () => {
    for (const button of toggles) button.setAttribute("aria-expanded", String(shown()));
  };

  sync(); // the inline script set the state; the buttons have not been told yet

  for (const button of toggles) {
    button.addEventListener("click", () => {
      const next = !shown();
      root.dataset.lsNav = next ? "on" : "off";
      // A rail the reader hid should stay hidden on the next page. Wrapped
      // because a locked-down browser throws on write and a nav that cannot
      // remember is still a working nav.
      try {
        localStorage.setItem(KEY, next ? "on" : "off");
      } catch {}
      sync();
    });
  }
}
