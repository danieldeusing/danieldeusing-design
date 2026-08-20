/*
 * tooltip.js — viewport-clamped hover/focus tooltips for `[data-tip]`.
 *
 * Markup contract:
 *   <span data-tip="Explanation shown on hover">metric</span>
 *
 * THIS REPLACES THE NATIVE `title`, AND THAT IS THE POINT. A `title` is the browser's tooltip: it
 * appears after roughly a second of hovering, is unstyled, cannot be reached by keyboard on most
 * engines, and does not exist at all on a touch screen. `data-tip` shows INSTANTLY, wears the
 * estate's own look, opens on focus as well as hover, and is clamped into the viewport.
 *
 * NAME vs DESCRIPTION — the distinction that makes the swap safe, and the one it is easy to get
 * wrong. `title` does two unrelated jobs, and only one of them belongs here:
 *   · on an element with visible text, `title` is a DESCRIPTION → `data-tip`.
 *   · on an icon button with no text, `title` is the element's accessible NAME → `aria-label`.
 *     Replacing that one with `data-tip` alone leaves a button announced as "button".
 * An icon button that also wants a hover takes BOTH: `aria-label` names it, `data-tip` explains it.
 *
 * One singleton panel (`#ddtip`, styled in src/tooltip.css) is appended to
 * <body> and positioned with `position: fixed`, so it escapes every overflow/
 * clip context and always renders on top. Placement prefers below the anchor,
 * flips above when there is no room, and clamps horizontally to the viewport —
 * a tooltip must never be cut off. Event delegation means dynamically rendered
 * [data-tip] nodes just work.
 */
export function initTooltips() {
  if (document.getElementById("ddtip")) return;
  const tip = document.createElement("div");
  tip.id = "ddtip";
  tip.setAttribute("role", "tooltip");
  document.body.appendChild(tip);

  let anchor = null;

  // A TOOLTIP MUST NEVER COVER AN OPEN SELECT (Daniel, screenshot 2026-08-15).
  //
  // The tip panel is `position: fixed; z-index: 9999` — deliberately above everything, so it can
  // never be clipped by an overflow container. `.select-panel` is z-index 60. So when a select's
  // listbox is open and the pointer is anywhere near a `[data-tip]` — very often the ⓘ INSIDE the
  // trigger's own label — the tip paints straight over the options you are trying to read.
  //
  // Suppressing beats re-positioning. A tip that flips to the other side still fights a panel that
  // can be full-width and viewport-tall, and "somewhere else on screen" is not a promise this can
  // keep. While a listbox is open the choices ARE the content; an informational aside about the
  // control you already opened is not worth a single covered option.
  //
  // Checked through the DOM rather than by importing select.js: the panel only exists while open,
  // so its presence IS the state. No shared module variable, no import cycle, and it stays correct
  // for any future component that renders a `.select-panel`.
  const selectIsOpen = () => Boolean(document.querySelector(".select-panel"));

  function show(el) {
    if (selectIsOpen()) return;
    // POINT THE ANCHOR AT THE PANEL. `role="tooltip"` alone describes nothing: without
    // aria-describedby the panel is a div a screen reader never reaches, so `data-tip` was
    // announced to nobody while the native `title` it replaces IS announced. Any estate converting
    // `title` to `data-tip` — which is the whole point of this component — would have been trading
    // a slow tooltip for a silent one.
    //
    // Set per show and REMOVED on hide rather than written once at init: a stale describedby
    // pointing at a hidden panel makes every anchor claim a description it is not showing.
    if (anchor && anchor !== el) anchor.removeAttribute("aria-describedby");
    anchor = el;
    el.setAttribute("aria-describedby", "ddtip");
    tip.textContent = el.getAttribute("data-tip");
    tip.style.display = "block";
    tip.style.left = "0px";
    tip.style.top = "0px";
    const margin = 8;
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const x = Math.min(Math.max(r.left, margin), window.innerWidth - t.width - margin);
    let y = r.bottom + 6;
    if (y + t.height > window.innerHeight - margin) y = r.top - t.height - 6;
    if (y < margin) y = margin;
    // DIVIDE BY THE ZOOM. Consumers set `zoom` on <html> (cockpit scales the whole layout to a
    // 1920 reference), and the two sides of this calculation live in different coordinate spaces:
    // getBoundingClientRect() and window.innerWidth are VISUAL px — already multiplied — while
    // style.left is a CSS length the browser multiplies AGAIN on the way out. So the tooltip
    // rendered at x*zoom, an error that grows with distance from the origin: measured at zoom
    // 1.35, an anchor 198px in got a tooltip 69px adrift and one 949px in got 329px, far enough
    // to leave the viewport entirely.
    //
    // Only the WRITE is converted. The clamp above is already correct because both its operands
    // are visual, and "fixing" it too would break it in the other direction.
    const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1;
    tip.style.left = x / zoom + "px";
    tip.style.top = y / zoom + "px";
  }
  function hide() {
    if (anchor) anchor.removeAttribute("aria-describedby");
    anchor = null;
    tip.style.display = "none";
  }

  document.addEventListener("mouseover", (event) => {
    const el = event.target.closest("[data-tip]");
    if (el) show(el);
    else if (anchor) hide();
  });
  document.addEventListener("focusin", (event) => {
    const el = event.target.closest("[data-tip]");
    if (el) show(el);
  });
  document.addEventListener("focusout", hide);
  document.addEventListener("scroll", () => anchor && show(anchor), true);
  // The guard in show() stops a tip APPEARING over an open listbox; this is the other half — a tip
  // already on screen when the select opens. The ⓘ frequently sits inside the trigger's own label,
  // so "hovering the tip, then clicking to open" is the ordinary path, not an edge case.
  //
  // pointerdown on the document, not a select-specific hook: pressing anything is a statement that
  // you are done reading and want to act, and an informational aside should not outlive that. It
  // also keeps this decoupled — no event contract with select.js to keep in step.
  //
  // The scroll handler above re-shows from `anchor`, which would put the tip straight back while
  // the panel scrolled; show()'s own guard refuses that, so the two rules do not fight.
  document.addEventListener("pointerdown", hide, true);

  // AND THE ORDERING CASE, which the two rules above do not cover between them.
  //
  // A real click on a select trigger fires mousedown -> FOCUS -> mouseup -> click, and the listbox
  // only opens on `click`. So `focusin` reaches show() while no `.select-panel` exists yet: the
  // guard sees a clean document, the tip appears, and the panel then opens underneath it. The
  // pointerdown hide above fires even earlier, so it cannot help either — the tip is re-shown after
  // it. That is why the first fix passed a synthetic test and failed on the real page: dispatching
  // pointerdown-then-click skips the focus event that a genuine click puts between them.
  //
  // So watch for the panel ARRIVING rather than asking whether it is there. This is the only one of
  // the three rules that is ordering-independent, and it is what actually closes the bug.
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.(".select-panel") || node.querySelector?.(".select-panel")) { hide(); return; }
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}
