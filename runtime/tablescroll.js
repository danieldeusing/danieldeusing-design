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
 * Which means the markup contract is: nothing. Author a plain <table>. This walks the
 * document once and gives every table that does not already have one a .tablewrap parent
 * (chrome.css styles it: overflow-x plus a fade on the right edge that says "there is more
 * over here"). Pages that already hand-wrapped their tables are left exactly as they are,
 * so adopting this is never a migration.
 *
 *   import { initTableScroll } from "@danieldeusing/design/runtime";
 *   initTableScroll();
 *
 * Call it after your content is in the DOM. Safe to call again when you add more — a table
 * that is already wrapped is skipped, so a page that renders rows from an API can call it
 * after every fetch.
 */

const WRAP_CLASS = "tablewrap";

/**
 * @param {ParentNode} [root=document] Limit the sweep to a subtree — useful after
 *   re-rendering one panel rather than the whole page.
 */
export function initTableScroll(root = document) {
  for (const table of root.querySelectorAll("table")) {
    // Already handled, either by this function on an earlier pass or by hand in the
    // markup. closest() rather than checking parentElement: a page is free to put its
    // table inside a figure inside the wrapper, and that is still wrapped.
    if (table.closest(`.${WRAP_CLASS}`)) continue;

    const wrap = document.createElement("div");
    wrap.className = WRAP_CLASS;
    // The table stays exactly where it was in the document; only a div appears around
    // it. replaceWith + appendChild rather than innerHTML, so event listeners already
    // bound to rows survive — sortable headers and row menus are common on these pages.
    table.replaceWith(wrap);
    wrap.appendChild(table);
  }
}
