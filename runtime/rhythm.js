/*
 * rhythm.js — find two stacked blocks that touch.
 *
 * base.css keeps .6rem above a block (a callout, a table's toolbar, a table, a code block…) when it
 * follows another block, as a sibling or across the unclassed mount <div>s a JS-painted page wraps
 * each block in (the STACKED BLOCKS rule). A rule cannot see every shape a page builds: a mount two
 * levels deep, a mount with a class, a flex column with no gap. So this is the check a page runs
 * against its own rendered DOM, in a browser check (cockpit's bin/cockpit-dom-check, the demos):
 *
 *   import { findFlushBlocks } from "@danieldeusing/design/runtime/rhythm";
 *   const flush = findFlushBlocks();   // [] when every stacked pair has air between them
 *
 * A pair is two blocks from STACKED_BLOCKS, both rendered, neither inside the other, overlapping
 * horizontally, with the lower one's top border edge within half a pixel of the upper one's bottom.
 *
 * TWO EXCEPTIONS, the same two the stylesheet makes: a fold after a fold (a run of folds is one list,
 * each fold drawing its own rule), and a lower block that carries `data-flush` — the page's word that
 * this one sits flush on purpose. Anything else a page wants flush says so with that attribute.
 *
 * findMisplacedFilters() is the same kind of check for Daniel's filter rule (0.62.0): "Filters, sort
 * and so on are always right aligned. Search input field always left aligned. Active filters have
 * colored text and there must be the 'x' icon to remove the filter (only not if one filter must
 * always be set)."
 *
 * Nothing runs at import, and nothing touches the DOM until it is called.
 */

/** The block-level components the rhythm rule spaces. base.css repeats this list; check-data asserts the two agree. */
export const STACKED_BLOCKS = [
  ".callout", ".notice", ".fence", ".filter-bar", ".tablewrap", "table", "pre", ".code-block", ".cmd",
  ".legend", ".chart", ".tabs", "details.fold", ".card-grid", ".stat-grid", ".row-list", ".console",
];

const FLUSH_PAIRS = [["details.fold", "details.fold"]];

/**
 * Every pair of stacked blocks under `root` with no space between their border boxes.
 * Returns `[{ upper, lower, gap }]`; `gap` is the measured distance in px.
 */
export function findFlushBlocks(root = document, { blocks = STACKED_BLOCKS, tolerance = 0.5 } = {}) {
  const boxes = [...root.querySelectorAll(blocks.join(","))]
    .map((el) => [el, el.getBoundingClientRect()])
    .filter(([el, box]) => box.height > 0 && getComputedStyle(el).visibility !== "hidden");
  const pairs = [];
  // ponytail: every block against every block, O(n²); a page with thousands of blocks would sort by top first.
  for (const [lower, below] of boxes) {
    if (lower.hasAttribute("data-flush")) continue;
    for (const [upper, above] of boxes) {
      if (upper === lower || upper.contains(lower) || lower.contains(upper)) continue;
      const gap = below.top - above.bottom;
      if (Math.abs(gap) > tolerance) continue;
      if (Math.min(above.right, below.right) - Math.max(above.left, below.left) <= 0) continue;
      if (FLUSH_PAIRS.some(([a, b]) => upper.matches(a) && lower.matches(b))) continue;
      pairs.push({ upper, lower, gap });
    }
  }
  // A table ends where its .tablewrap ends: one touch, reported once, by the outermost blocks.
  return pairs.filter((p) => !pairs.some((q) => q !== p &&
    ((q.lower === p.lower && q.upper.contains(p.upper)) || (q.upper === p.upper && q.lower.contains(p.lower)))));
}

const FILTER_CONTROLS = ".filter-dd, select[data-filter], .sort-ctl, .chip-set";
const BAR_LEAD = 'input[type="search"], .search-field, h2, h3, h4, h5, h6, .filter-bar-lead';

// Drawn, and seen: display none (and every hidden ancestor) is a zero box, visibility hidden is not.
const rendered = (el) => {
  const box = el.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== "hidden";
};

/**
 * Every filter control under `root` that breaks the filter rule, as `[{ element, reason }]`:
 *
 *   "outside-filter-bar"  a `.filter-dd`, a `select[data-filter]` the runtime has not wrapped, a
 *                         `.sort-ctl` or a `.chip-set` with no `.filter-bar` around it. A table
 *                         header (`th`) and a `.dropdown-panel` keep their own controls; a dialog
 *                         does not — its toolbar is a `.filter-bar` too. A `.chip-set` of
 *                         `.chip--remove` chips is a list of values, not a filter, and is not judged.
 *                         (A `.switch` or `.segmented` is not judged either: both are settings too.)
 *   "lead-not-left"       a bar's lead (a search input or `.search-field`, a heading h2–h6, a
 *                         `.filter-bar-lead`) that is not in the run of leads a row starts with, or
 *                         the first lead of a row whose left edge is not the bar's left content edge.
 *                         Several leads in a row are fine (a prompt label, then the search).
 *   "controls-not-right"  on a visual row of a bar, the right-most control that is not the lead does
 *                         not end at the bar's right content edge. `element` is that control.
 *   "active-unmarked"     an optional `.filter-dd` (its select has an empty option) holding a value
 *                         whose trigger lacks `data-active="true"` or whose `.filter-clear` is not
 *                         shown: the page changed the value and the runtime never heard of it.
 *   "required-clearable"  a required `.filter-dd` (no empty option) whose `.filter-clear` is shown.
 *
 * Only what is rendered is judged, as in findFlushBlocks(): a control, a bar or a bar's child that
 * is `display: none` (itself or an ancestor, so a closed dialog), zero-sized or `visibility: hidden`
 * is skipped. Edges are border boxes, compared within `tolerance` px.
 */
export function findMisplacedFilters(root = document, { tolerance = 1 } = {}) {
  const found = [];
  const report = (element, reason) => found.push({ element, reason });

  for (const el of root.querySelectorAll(FILTER_CONTROLS)) {
    if (el.matches("select") && el.closest(".filter-dd")) continue; // its .filter-dd answers for it
    if (!rendered(el) || el.closest(".filter-bar, th, .dropdown-panel") || el.matches(".chip-set:has(> .chip--remove)")) continue;
    report(el, "outside-filter-bar");
  }

  // ponytail: left-to-right only; an RTL bar would mirror both edges.
  for (const bar of root.querySelectorAll(".filter-bar")) {
    if (!rendered(bar)) continue;
    const box = bar.getBoundingClientRect();
    const style = getComputedStyle(bar);
    const left = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
    const right = box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
    // One visual row = children whose boxes overlap vertically (align-items centres them, so their
    // tops differ within a row); a row keeps its children in document order.
    const rows = [];
    for (const child of bar.children) {
      if (!rendered(child)) continue;
      const at = child.getBoundingClientRect();
      const row = rows.find((r) => at.top < r.bottom - tolerance && at.bottom > r.top + tolerance);
      if (row) {
        row.top = Math.min(row.top, at.top);
        row.bottom = Math.max(row.bottom, at.bottom);
        row.items.push([child, at]);
      } else rows.push({ top: at.top, bottom: at.bottom, items: [[child, at]] });
    }
    for (const { items } of rows) {
      let last = null;
      items.forEach(([child, at], i) => {
        if (!child.matches(BAR_LEAD)) {
          if (!last || at.right > last[1].right) last = [child, at];
        } else if (last || (i === 0 && Math.abs(at.left - left) > tolerance)) report(child, "lead-not-left");
      });
      if (last && Math.abs(last[1].right - right) > tolerance) report(last[0], "controls-not-right");
    }
  }

  for (const dd of root.querySelectorAll(".filter-dd")) {
    const select = dd.querySelector("select");
    if (!select || !rendered(dd)) continue;
    const clear = dd.querySelector(".filter-clear");
    const clearShown = !!clear && rendered(clear);
    if ([...select.options].some((o) => o.value === "")) {
      const marked = dd.querySelector(".select-trigger")?.getAttribute("data-active") === "true";
      if (select.value !== "" && (!marked || !clearShown)) report(dd, "active-unmarked");
    } else if (clearShown) report(dd, "required-clearable");
  }
  return found;
}
