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
