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
 * line leaves the bottom. The observer fires whenever a target's top crosses that line, in either
 * direction, and its own entries say which side each target is on — so no rectangle is read.
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
 * Entries and targets rendered after the call are picked up (one MutationObserver, as the other
 * runtime modules do), so a page that builds its sections from data needs no second call. The
 * entry for the current section is re-marked after a re-render replaces the list.
 *
 * @param {ParentNode} [root=document] where the entries live
 * @returns {{ destroy(): void }} stops the spy and clears the mark
 */
export function initToc(root = document) {
  const reached = new Set();
  const observed = new Set();
  let current = null;

  const links = () => [...root.querySelectorAll("[data-toc-link]")];
  // Writes only what changed: this runs on every re-render the page does, not only on a scroll.
  const mark = () => {
    for (const link of links()) {
      const on = link.getAttribute("data-toc-link") === current;
      if (on && link.getAttribute("aria-current") !== "true") link.setAttribute("aria-current", "true");
      else if (!on && link.hasAttribute("aria-current")) link.removeAttribute("aria-current");
    }
  };

  const spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const line = entry.rootBounds ? entry.rootBounds.bottom : innerHeight * 0.3;
        if (entry.boundingClientRect.top <= line) reached.add(entry.target.id);
        else reached.delete(entry.target.id);
      }
      // The last in the ORDER OF THE LIST, which is the order of the page.
      const past = links().filter((link) => reached.has(link.getAttribute("data-toc-link")));
      current = past.length ? past[past.length - 1].getAttribute("data-toc-link") : null;
      mark();
    },
    { rootMargin: "0px 0px -70% 0px" },
  );

  const observeTargets = () => {
    // A target a re-render replaced is let go, or a page that redraws its sections every poll
    // would pile up detached nodes in the observer for the life of the tab.
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
    if (!records.some((record) => record.addedNodes.length)) return;
    observeTargets();
    mark();
  });
  // The whole document, not `root`: the entries live in root, their targets anywhere on the page.
  watcher.observe(document, { childList: true, subtree: true });

  return {
    destroy() {
      spy.disconnect();
      watcher.disconnect();
      current = null;
      mark();
    },
  };
}
