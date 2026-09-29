/*
 * lsnav.js — show/hide for the `ls -l` site rail (src/chrome.css), and the measured chrome that
 * every sticky layer reads.
 *
 * Markup contract:
 *   <div class="ls-nav-head">
 *     <span class="ls-nav-title">ls -l</span>
 *     <button class="ls-nav-toggle" data-ls-nav-toggle aria-controls="nav" aria-expanded="true"></button>
 *   </div>
 *   <div class="ls-nav" id="nav"><ul class="ls-panel">…</ul></div>
 *
 * Any other element carrying `data-ls-nav-toggle` + `aria-controls="nav"` is a second toggle for
 * the same rail (danieldeusing.de has one in its home banner) and is kept in step. The state is
 * `aria-expanded`, never `aria-pressed`: the button opens and closes a region, it is not a
 * setting. A stale `aria-pressed` in the markup is removed, because a pressed state nothing ever
 * updates is a false statement to a screen reader.
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
 */
const KEY = "ls-nav";
const TOGGLE = "[data-ls-nav-toggle]";

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
 *
 * AND --sticky-top (0.60.0): where content that sticks stops — the header's bottom edge plus the
 * page toolbar's height. The table of contents and a sticky filter bar park there, and the
 * viewport's scroll padding keeps anchors below it. It is measured for the same reason the rail's
 * top is: an alert banner above the header, or a toolbar that wraps to a second line, moves it.
 */
function measureChrome() {
  const root = document.documentElement;
  const bar = document.querySelector("header.bar");
  const status = document.querySelector("footer.status");
  const toolbar = document.querySelector(".page-toolbar");
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
  const zoom = Number(getComputedStyle(root).zoom) || 1;
  const h = (el) => (el ? el.offsetHeight : 0);
  // OVERLAP BY 1px rather than trying to meet the chrome exactly. offsetHeight is an
  // INTEGER while the bar's real height is fractional (44.97), so "exactly flush" is
  // a rounding coin-flip — and under a zoomed layout the error is multiplied: at
  // zoom 1.25 the bar ended at 56.00 and a 45px inset put the rail at 56.25, a
  // quarter-pixel seam of page background that is plainly visible on a wide screen.
  // Both chrome elements are opaque and sit ABOVE the rail (z-index 30 and 50 vs 25),
  // so a pixel of tuck is invisible, whereas a pixel of gap is not.
  // A page with no header has nothing above its content: 0, not the CSS fallback's 3rem.
  const top = bar ? Math.max(0, bar.getBoundingClientRect().bottom / zoom - 1) : 0;
  write(root, "--ls-nav-top", `${top}px`);
  // A hidden footer (mobile folds it into the burger) reserves nothing.
  write(root, "--ls-nav-bottom", `${Math.max(0, h(status) - 1)}px`);
  write(root, "--sticky-top", `${top + h(toolbar)}px`);
}

// This runs on EVERY scroll event, and a write to <html>'s inline style invalidates the style of
// the whole document even when the value is the one already there. Reading the inline value back
// costs no layout, so a scroll that moves nothing writes nothing.
function write(root, name, value) {
  if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
}

let wired = false;

export function initLsNav() {
  // MEASURED ON EVERY PAGE, RAIL OR NOT (0.60.0). This used to return early on a page with no
  // toggle, before measuring anything — so the minimap, which reads --ls-nav-top/--ls-nav-bottom
  // to sit between the chrome, silently fell back to 3rem / 2.2rem on exactly the rail-less docs
  // the template recommends. The sticky layers read what this writes too.
  measureChrome();
  if (wired) return;
  wired = true;

  addEventListener("resize", measureChrome);
  // A sticky header's bottom edge MOVES while anything above it scrolls away: with the banner
  // on screen it sits at banner+header, and once the banner is gone it sits at header. A height
  // never changed, so this listener was never needed before.
  addEventListener("scroll", measureChrome, { passive: true });
  // The bar reflows when webfonts land, which changes its height after first paint.
  if (document.fonts?.ready) document.fonts.ready.then(measureChrome).catch(() => {});

  const root = document.documentElement;
  const sync = () => {
    const shown = String(root.dataset.lsNav !== "off");
    for (const button of document.querySelectorAll(TOGGLE)) {
      if (button.getAttribute("aria-expanded") !== shown) button.setAttribute("aria-expanded", shown);
      button.removeAttribute("aria-pressed");
    }
  };
  sync(); // the inline script set the state; the buttons have not been told yet

  // Delegated, so a toggle rendered after this call works like the ones in the markup.
  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest(TOGGLE) : null;
    if (!button) return;
    const next = root.dataset.lsNav === "off";
    root.dataset.lsNav = next ? "on" : "off";
    // A rail the reader hid should stay hidden on the next page. Wrapped
    // because a locked-down browser throws on write and a nav that cannot
    // remember is still a working nav.
    try {
      localStorage.setItem(KEY, next ? "on" : "off");
    } catch {}
    sync(); // now, not a microtask later: the pressed button's state is part of the press
  });

  // THE STATE IS WATCHED, NOT THE CLICK: every toggle is re-synced whenever html[data-ls-nav]
  // changes, whoever changed it, and whenever a toggle is added — a second toggle rendered later
  // would otherwise show its markup's default until the first press.
  new MutationObserver((records) => {
    const relevant = records.some(
      (record) =>
        record.type === "attributes" ||
        [...record.addedNodes].some((node) => node instanceof Element && (node.matches(TOGGLE) || node.querySelector(TOGGLE))),
    );
    if (relevant) sync();
  }).observe(root, { attributes: true, attributeFilter: ["data-ls-nav"], childList: true, subtree: true });
}
