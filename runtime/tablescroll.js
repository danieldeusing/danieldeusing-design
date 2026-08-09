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
 */

const WRAP_CLASS = "tablewrap";

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

  if (documentObserver) return;
  documentObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === "TABLE") wrap(node);
        else for (const table of node.querySelectorAll("table")) wrap(table);
      }
    }
  });
  documentObserver.observe(document.documentElement, { childList: true, subtree: true });
}
