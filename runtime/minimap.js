/*
 * minimap.js — a document minimap: one bar per section, down the left edge.
 *
 * Replaces the "On this page" list. A text table of contents costs a whole
 * column of the page to repeat headings the reader is about to scroll past
 * anyway; a minimap answers the same two questions — how long is this, and
 * where am I — in 2rem of gutter, so the content gets the full width back.
 *
 * Markup contract: NOTHING. Point it at the sections and it builds itself:
 *
 *   initMinimap({ sections: "section.doc" });
 *
 * Each bar is a real <button>, so the whole thing is tabbable and every bar is
 * announced with its section's heading — the text is not on screen, but it is
 * never only visual. Bar LENGTH encodes heading depth (h2 longer than h3), which
 * is the one piece of structure a wordless strip can still carry.
 *
 * The strip scrolls itself when a document has more sections than fit the
 * viewport, and keeps the active bar in view.
 */
const LEVEL_WIDTH = { 1: 100, 2: 100, 3: 62, 4: 40 };

export function initMinimap(options = {}) {
  const {
    sections: sectionSelector = "section.doc",
    label = "document sections",
    mount = document.body,
  } = options;

  const sections = Array.from(document.querySelectorAll(sectionSelector)).filter((s) => s.id);
  // One bar is not a map. Same reasoning as a one-entry nav: it would tell the
  // reader nothing they cannot already see, and it would still cost the gutter.
  if (sections.length < 2) return null;

  const nav = document.createElement("nav");
  nav.className = "minimap";
  nav.setAttribute("aria-label", label);

  const bars = sections.map((section) => {
    const heading = section.querySelector("h1, h2, h3, h4");
    const text = (heading?.textContent || section.id).trim();
    const level = heading ? Number(heading.tagName[1]) : 2;

    const bar = document.createElement("button");
    bar.type = "button";
    bar.className = "minimap-bar";
    bar.style.setProperty("--minimap-bar-w", `${LEVEL_WIDTH[level] ?? 62}%`);
    // The label is the accessible name AND the hover label: wordless on screen,
    // never wordless to a screen reader or to a hovering pointer.
    //
    // `data-tip`, NOT `title`. The native tooltip waits about a second before it
    // appears, renders in the OS's own chrome, and cannot be styled — on a strip
    // whose entire job is to be scrubbed, a delay that long means the reader has
    // moved to the next bar before the first label arrives. The system's tooltip
    // (src/tooltip.css + initTooltips) shows on mouseover with no delay, in the
    // page's own type and palette, and is delegated — so bars built here at
    // runtime need no extra wiring. Call initTooltips() once on the page.
    bar.setAttribute("aria-label", text);
    bar.dataset.tip = text;
    bar.addEventListener("click", () => {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    nav.append(bar);
    return bar;
  });

  mount.append(nav);

  const setActive = (index) => {
    bars.forEach((bar, i) => {
      const on = i === index;
      bar.classList.toggle("active", on);
      // aria-current, not aria-selected: these are links into a document, not
      // a tab set, and only one can be current.
      if (on) bar.setAttribute("aria-current", "true");
      else bar.removeAttribute("aria-current");
    });
    const bar = bars[index];
    // Keep the active bar reachable once the strip itself is scrolling.
    if (bar && nav.scrollHeight > nav.clientHeight) {
      const top = bar.offsetTop;
      const bottom = top + bar.offsetHeight;
      if (top < nav.scrollTop || bottom > nav.scrollTop + nav.clientHeight) {
        nav.scrollTop = top - nav.clientHeight / 2;
      }
    }
  };

  // Same approach as a scroll-spy TOC: track what is on screen and light the
  // topmost one, so a short trailing section does not steal the highlight from
  // the long one the reader is actually in.
  const visible = new Set();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      if (!visible.size) return;
      let best = -1;
      sections.forEach((section, i) => {
        if (visible.has(section) && (best === -1 || i < best)) best = i;
      });
      if (best !== -1) setActive(best);
    },
    { rootMargin: "-10% 0px -70% 0px", threshold: 0 },
  );
  for (const section of sections) observer.observe(section);

  setActive(0);
  return { nav, bars, destroy: () => { observer.disconnect(); nav.remove(); } };
}
