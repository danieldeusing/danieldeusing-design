/*
 * toc.js — the table of contents' scroll-spy (src/chrome.css `.toc`, `.navlist`).
 *
 * Markup contract:
 *   <aside class="toc">
 *     <nav class="navlist toc-inner" aria-labelledby="toc-h">
 *       <p class="navlist-label" id="toc-h">on this page</p>
 *       <ol>
 *         <li><a href="#overview" data-toc-link="overview">overview</a></li>
 *         <li class="navlist-sub"><a href="#steps" data-toc-link="steps">steps</a></li>
 *       </ol>
 *     </nav>
 *   </aside>
 * `data-toc-link` names the id of the section (or heading) the entry points at.
 *
 * WHAT IT MARKS: `aria-current="true"` on ONE entry — the last one whose target has reached the
 * reading line, 30% of the way down the viewport — and on no other. The two spies this replaces
 * (cockpit's portal.js and danieldeusing.de's article page) toggled a CLASS, so the highlight was
 * painted and never said; the attribute is what a screen reader announces, and the stylesheet keys
 * on it.
 *
 * The line is the bottom of the band `rootMargin: 0 0 -70% 0`, the value both sources had settled
 * on independently: a section becomes current as it reaches the top of the page, not when its last
 * line leaves the bottom. The observer only says WHEN to look: on every callback the current entry
 * is recomputed from where every target is now (one rect read per target). Its entries alone are
 * not enough, because an instant jump can carry a target from above the band to below it without
 * ever crossing it, and then no entry is delivered for that target at all: measured, 6 of 11
 * upward TOC clicks left a lower section marked, and scrollTo(0) from the bottom left the last one.
 *
 * THE LAST TARGET PAST THE LINE, NOT THE TOPMOST ONE IN THE BAND. Both sources marked the topmost
 * target intersecting the band, which is right for small targets (pagr's headings) and wrong for
 * sections (cockpit's): a TOC link lands its section at the scroll padding, a line under the
 * toolbar, and the PREVIOUS section's last 40px still sits inside the band above it. Measured on
 * the specimen page, every one of five TOC clicks marked the section before the one clicked. With
 * sections or headings alike, the last target whose top is above the line is the one being read.
 *
 * Above the first target nothing is marked: the reader is in the page's introduction. A last
 * section shorter than the lower 70% of the viewport never reaches the line; give the page room
 * below it (its bottom padding) if its TOC must be able to mark it.
 *
 * Entries and targets rendered after the call are picked up, and a target that goes is let go (one
 * MutationObserver, as the other runtime modules do), so a page that builds its sections from data
 * needs no second call. The mark is re-asserted when a renderer rewrites it: a list re-rendered
 * from markup that never carries `aria-current` (cockpit's dom-patch writes attributes in place)
 * would otherwise lose the mark until the next scroll crossed a line.
 *
 * @param {ParentNode} [root=document] where the entries live
 * @returns {{ destroy(): void }} stops the spy and clears the mark
 */
export function initToc(root = document) {
  const observed = new Set();
  let current = null;
  let line = innerHeight * 0.3;

  const links = () => [...root.querySelectorAll("[data-toc-link]")];
  // Writes only what changed: this runs on every re-render the page does, not only on a scroll.
  const mark = () => {
    for (const link of links()) {
      const on = link.getAttribute("data-toc-link") === current;
      if (on && link.getAttribute("aria-current") !== "true") link.setAttribute("aria-current", "true");
      else if (!on && link.hasAttribute("aria-current")) link.removeAttribute("aria-current");
    }
  };
  // The last entry, in the ORDER OF THE LIST (the order of the page), whose target's top has
  // reached the line — read from where the targets are now, never from which ones crossed.
  const update = () => {
    current = null;
    for (const link of links()) {
      const target = document.getElementById(link.getAttribute("data-toc-link"));
      if (target && target.getBoundingClientRect().top <= line) current = link.getAttribute("data-toc-link");
    }
    mark();
  };

  const spy = new IntersectionObserver(
    (entries) => {
      const bounds = entries[0]?.rootBounds;
      if (bounds) line = bounds.bottom;
      update();
    },
    { rootMargin: "0px 0px -70% 0px" },
  );

  const observeTargets = () => {
    // A target that left the page is let go, or a page that redraws its sections every poll would
    // pile up detached nodes in the observer for the life of the tab.
    for (const target of observed) {
      if (target.isConnected) continue;
      spy.unobserve(target);
      observed.delete(target);
    }
    for (const link of links()) {
      const target = document.getElementById(link.getAttribute("data-toc-link"));
      if (!target || observed.has(target)) continue;
      observed.add(target);
      spy.observe(target);
    }
  };
  observeTargets();

  const watcher = new MutationObserver((records) => {
    let moved = false;
    let rewritten = false;
    for (const record of records) {
      if (record.type === "attributes") {
        if (record.attributeName === "data-toc-link") moved = true;
        else rewritten = true;
      } else if ([...record.addedNodes, ...record.removedNodes].some((node) => node instanceof Element)) {
        moved = true;
      }
    }
    if (moved) {
      observeTargets();
      update();
    } else if (rewritten) {
      mark();
    }
  });
  // The whole document, not `root`: the entries live in root, their targets anywhere on the page.
  watcher.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-current", "data-toc-link"] });

  return {
    destroy() {
      spy.disconnect();
      watcher.disconnect();
      current = null;
      mark();
    },
  };
}
