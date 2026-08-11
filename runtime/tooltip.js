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
  function show(el) {
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
}
