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
 * WHAT IT MARKS: `aria-current="true"` on the entry whose target is the topmost one in the top 30%
 * of the viewport, and on no other entry. The two spies this replaces (cockpit's portal.js and
 * danieldeusing.de's article page) toggled a CLASS, so the highlight was painted and never said;
 * the attribute is what a screen reader announces, and the stylesheet keys on it.
 *
 * The band is `rootMargin: 0 0 -70% 0`, the value both sources had settled on independently: a
 * section becomes current as it reaches the top of the page, not when its last line leaves the
 * bottom. When nothing is in the band — the reader is deep inside one long section — the last
 * entry marked stays marked, because "you are still here" is the true answer.
 *
 * Entries and targets rendered after the call are picked up (one MutationObserver, as the other
 * runtime modules do), so a page that builds its sections from data needs no second call. The
 * entry for the current section is re-marked after a re-render replaces the list.
 *
 * @param {ParentNode} [root=document] where the entries live
 * @returns {{ destroy(): void }} stops the spy and clears the mark
 */
export function initToc(root = document) {
  const visible = new Set();
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
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      }
      // Topmost in the ORDER OF THE LIST, which is the order of the page; two targets can share
      // the band while a short section passes through it.
      const top = links().find((link) => visible.has(link.getAttribute("data-toc-link")));
      if (!top) return;
      current = top.getAttribute("data-toc-link");
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
