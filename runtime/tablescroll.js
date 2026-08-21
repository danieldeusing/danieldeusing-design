/*
 * tablescroll.js — no table may push the page sideways.
 *
 * A wide table is the single most common way a page starts scrolling horizontally as a
 * WHOLE, which is the one layout failure that makes a site feel broken: the header slides
 * away, the fixed footer stops reaching the edge, and every line of body text now needs
 * two-axis scrolling to read. The table is the thing that is too wide, so the table is the
 * thing that should scroll.
 *
 * CSS cannot do this alone. `overflow-x: auto` has to sit on an element that WRAPS the
 * table, and a table cannot wrap itself — `display: block` on a <table> does technically
 * make it scrollable and also throws away the table layout algorithm, so columns stop
 * aligning across rows. There is no selector for "my parent". Hence a runtime.
 *
 * Which means the markup contract is: nothing. Author a plain <table>. This gives every
 * table that does not already have one a .tablewrap parent (chrome.css styles it: overflow-x
 * plus a fade on the right edge that says "there is more over here"). Pages that already
 * hand-wrapped their tables are left exactly as they are, so adopting this is never a
 * migration.
 *
 *   import { initTableScroll } from "@danieldeusing/design/runtime";
 *   initTableScroll();
 *
 * AND IT KEEPS WRAPPING (0.23.0). Until then this was a single walk of the document at call
 * time, which is correct for a table that is in the markup and useless for one that arrives
 * from a fetch — and a dashboard's tables all arrive from a fetch. Cockpit called this from a
 * deferred module on page load, so it ran while every mount still said `loading…`: the walk
 * found nothing, the tables appeared a moment later unwrapped, and they stayed that way for
 * the life of the page. The static pages worked, which is exactly why nobody noticed — the
 * capability was in the estate for sixteen releases and did not reach the tables that are
 * actually too wide.
 *
 * A MutationObserver closes that, the same way `initSelects` and `initTablePagination`
 * already do, and for the same reason those needed one: cockpit does not mutate its panels,
 * it rebuilds them out of innerHTML on every poll, so an enhancement that only sees what
 * existed at load works until the first refresh and then quietly stops.
 *
 * ONE THING A HOST PAGE HAS TO KNOW, and it is the whole reason this was not always an
 * observer: a wrapper inserted by a runtime is a node the page's own renderer never wrote.
 * A reconciler that diffs new markup against the live DOM — cockpit's `dom-patch.js` — sees
 * a <div> where its markup says <table>, and its ordinary answer is to replace it, which
 * throws the table away on every poll and re-wraps a new one. That is worse than not
 * wrapping at all. A reconciler must therefore treat `.tablewrap` as standing in for the
 * table inside it; cockpit's patcher does, alongside the two exemptions it already carries
 * (`open` on a <details>, `hidden` on a <tr>) and for the identical reason — the renderer
 * does not own this. A page that assigns `innerHTML` outright needs no such thing.
 *
 * AND IT MEASURES (0.43.0), because the affordance was a constant, and a constant carries no
 * information. `.tablewrap::after` painted a right-edge fade on EVERY table whether or not there
 * was anything past the edge — so a table that could not scroll looked exactly like one that
 * could, and a reader who tried it and got nothing learnt that the fade means nothing. Measured
 * on cockpit's /automation/review: the 11-column activity table overflowed by 41px and the
 * 5-column ticker strip directly above it by zero, and the two were indistinguishable. Daniel
 * had not found the `links` column at all — it is the last one.
 *
 * The fades are now driven by `data-scroll` on the wrapper, one of:
 *
 *   none    nothing is hidden — no fade at all, which is the case this whole change exists for
 *   start   there is more to the RIGHT (the initial state of a table that overflows)
 *   middle  there is more in BOTH directions — the case a right-only fade could never express
 *   end     there is more to the LEFT
 *
 * `middle` is the state that made this worth doing: scrolled halfway, the old fade still said
 * "more over here" on the right and said nothing at all about the columns now hidden behind the
 * left edge. chrome.css owns which fade each state paints.
 *
 * This has to be JS. `container-type: scroll-state` answers it in CSS and is Chrome-only, and a
 * fix that lands on one engine leaves the estate disagreeing with itself — the same reason
 * `appearance: base-select` was refused.
 */

const WRAP_CLASS = "tablewrap";
// A property, not an attribute or a class: a reconciler that diffs its own markup against the live
// DOM would see a mark its markup does not carry. cockpit rebuilds these panels on every poll.
const WATCHED = Symbol("tablewrap-watched");

let documentObserver = null;

function wrap(table) {
  // Already handled, either by an earlier pass or by hand in the markup. closest() rather
  // than checking parentElement: a page is free to put its table inside a figure inside the
  // wrapper, and that is still wrapped. This is also what stops the observer waking on its
  // own output — the wrap below is a mutation, and the pass it triggers must find nothing.
  if (table.closest(`.${WRAP_CLASS}`)) return;

  const wrapper = document.createElement("div");
  wrapper.className = WRAP_CLASS;
  // The table stays exactly where it was in the document; only a div appears around it.
  // replaceWith + appendChild rather than innerHTML, so event listeners already bound to
  // rows survive — sortable headers and row menus are common on these pages.
  table.replaceWith(wrapper);
  wrapper.appendChild(table);
  watch(wrapper);
}

/**
 * Write the wrapper's scroll state onto it, so chrome.css can paint the fades that are true.
 *
 * The 1px tolerances are not defensive padding. `scrollWidth` and `clientWidth` are integers
 * rounded from fractional layout, so a table that fits exactly can report a scrollWidth one
 * larger than its clientWidth — and a fade on a table nobody can scroll is the exact defect
 * being removed here.
 */
function measure(wrapper) {
  // A wrapper with no layout box has not been measured, it has been GUESSED at. Tables routinely
  // render into a hidden tab panel — cockpit's do — where every dimension reads 0 and the naive
  // arithmetic below concludes "nothing to scroll", which is the one verdict this whole change
  // exists to stop a table from asserting without evidence. Leaving the attribute unset paints
  // nothing (chrome.css keys every fade off a value) and, unlike "none", records no claim; the
  // ResizeObserver in watch() fires the moment the panel is shown and the real state lands then.
  if (!wrapper.clientWidth) {
    delete wrapper.dataset.scroll;
    return;
  }
  const hidden = wrapper.scrollWidth - wrapper.clientWidth;
  if (hidden <= 1) {
    wrapper.dataset.scroll = "none";
    return;
  }
  const atStart = wrapper.scrollLeft <= 1;
  const atEnd = wrapper.scrollLeft >= hidden - 1;
  wrapper.dataset.scroll = atStart ? "start" : atEnd ? "end" : "middle";
}

/**
 * Keep one wrapper's state current. Three things change it and all three are needed: scrolling
 * it, resizing it, and the table inside it changing shape — a column filter that drops rows can
 * take the widest cell with it, and a table that no longer overflows must stop claiming it does.
 */
function watch(wrapper) {
  if (wrapper[WATCHED]) return;
  wrapper[WATCHED] = true;
  measure(wrapper);
  wrapper.addEventListener("scroll", () => measure(wrapper), { passive: true });
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => measure(wrapper));
    observer.observe(wrapper);
    const table = wrapper.querySelector("table");
    if (table) observer.observe(table);
  }
}

/**
 * Give every `<table>` a scroll container, and keep doing so for tables rendered later.
 *
 * @param {ParentNode} [root=document] Where to look for the initial pass — useful after
 *   re-rendering one panel rather than the whole page. The observer that follows is always
 *   document-wide and is installed once, however many times this is called.
 */
export function initTableScroll(root = document) {
  for (const table of root.querySelectorAll("table")) wrap(table);
  // Hand-wrapped tables never go through wrap(), and there are plenty — a page is free to write
  // its own `<div class="tablewrap">` and wrap() deliberately leaves it alone. Without this they
  // would keep the old always-on fade while every other table on the page told the truth.
  for (const wrapper of root.querySelectorAll(`.${WRAP_CLASS}`)) watch(wrapper);

  if (documentObserver) return;
  documentObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === "TABLE") wrap(node);
        else {
          for (const table of node.querySelectorAll("table")) wrap(table);
          if (node.classList.contains(WRAP_CLASS)) watch(node);
          for (const wrapper of node.querySelectorAll(`.${WRAP_CLASS}`)) watch(wrapper);
        }
      }
    }
  });
  documentObserver.observe(document.documentElement, { childList: true, subtree: true });
}
