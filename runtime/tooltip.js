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
  //
  // `details.dropdown[open]` is the same situation with the other menu component (0.45.1): the
  // trigger is a summary that very often carries the data-tip itself, so "hover, then click to
  // open" put the tip straight over the menu it had just explained. While a menu is open the
  // choices ARE the content; the aside waits.
  const menuIsOpen = () => Boolean(document.querySelector(".select-panel, details.dropdown[open]"));

  // SHOW IS IDEMPOTENT, AND THAT IS WHAT KEEPS A TIPPED CONTROL CLICKABLE.
  //
  // `mouseover` does not fire once per hover. It fires again every time the browser re-resolves
  // what is under the cursor — which, on a live-refreshing table, is constantly, and which happens
  // DURING a click: the real sequence on cockpit's activity table was mouseover, mouseover,
  // pointerdown, mousedown, mouseover, pointerup, mouseup, mouseover, all without the mouse
  // moving. Each of those re-ran the whole of show(): display none -> block, two forced
  // getBoundingClientRect() reads, four style writes.
  //
  // That churn is what broke the hit-test. pointerdown and pointerup resolved to the control,
  // while the compatibility MOUSE events resolved to an ancestor — mousedown and mouseup on the
  // <tbody> rather than the <button> — and a `click` is only synthesised when the press and the
  // release agreed on their target. So no click was ever produced and the handler never ran, on
  // every tooltipped control in a table. Cockpit shipped both its join buttons with the tooltip
  // REMOVED as a workaround.
  //
  // PROVEN by suppressing re-entry and nothing else: with the panel left SHOWING but show()
  // prevented from running again, the same click at the same pixel gave mousedown:BUTTON ->
  // click:BUTTON and the dialog opened.
  //
  // ⚠️ The guard is on the ANCHOR, not on visibility, and the scroll handler below calls place()
  // rather than show() for exactly this reason: a tooltip must still FOLLOW its anchor when the
  // page scrolls, and a guard that made repositioning a no-op would trade a dead button for a
  // tooltip stranded where the anchor used to be.
  function show(el) {
    if (menuIsOpen()) return;
    if (anchor === el) return;
    // POINT THE ANCHOR AT THE PANEL. `role="tooltip"` alone describes nothing: without
    // aria-describedby the panel is a div a screen reader never reaches, so `data-tip` was
    // announced to nobody while the native `title` it replaces IS announced. Any estate converting
    // `title` to `data-tip` — which is the whole point of this component — would have been trading
    // a slow tooltip for a silent one.
    //
    // Set per show and REMOVED on hide rather than written once at init: a stale describedby
    // pointing at a hidden panel makes every anchor claim a description it is not showing.
    if (anchor && anchor !== el) removeDescription(anchor);
    anchor = el;
    describe(el);
    tip.textContent = el.getAttribute("data-tip");
    tip.style.display = "block";
    place();
  }

  // WHERE THE PANEL GOES. Split out of show() so a scroll can re-place a tooltip that is already
  // open without going through show()'s anchor guard.
  function place() {
    if (!anchor) return;
    const el = anchor;
    // PARK IT OFF-SCREEN TO MEASURE IT, NEVER AT THE VIEWPORT ORIGIN.
    //
    // This said `top: 0px`, and that one line cost every tooltipped control its CLICKS.
    //
    // The panel has to be measured before it can be placed — `t.width` decides the horizontal
    // clamp and `t.height` decides whether it flips above the anchor — and it has to be measured
    // UNCONSTRAINED, because a fixed element with only `left` set gets `viewport - left` of
    // available width. Measuring it where it last sat therefore reports a panel narrower than it
    // really is whenever the previous anchor was over on the right. Hence the park, and the park
    // is still here: `left: 0` is what makes the measurement honest.
    //
    // What was wrong was parking it at `top: 0` — INSIDE the viewport, i.e. somewhere a pointer
    // can be. show() runs from `mouseover`, so this momentarily drops a 340px panel into the
    // viewport under the cursor and then forces a synchronous reflow by reading
    // getBoundingClientRect(). The browser's hit-test does not survive that: the pointer events
    // still resolve to the control (they carry the target the pointer was already on), but the
    // COMPATIBILITY MOUSE EVENTS that follow resolve to an ancestor — mousedown and mouseup land
    // on the <tbody> rather than the <button> — and a `click` is only generated when both landed
    // on the same node. So no click is ever produced and the handler never runs.
    //
    // MEASURED, on cockpit's execution table, same button and same pixel, toggling one thing at a
    // time (`pointer-events: none` on the panel does NOT save it — the panel never receives the
    // event, the CONTROL loses it):
    //   park at top: 0        -> pointerdown:BUTTON, mousedown:TBODY, mouseup:TBODY, no click
    //   no park at all        -> pointerdown/mousedown/mouseup/click all BUTTON  (but mis-measures)
    //   same work in rAF      -> all BUTTON  (correct, but costs a frame and the tip stops being instant)
    //   park at top: -9999px  -> all BUTTON, and t.width/t.height identical to the top: 0 reading
    // The last one keeps the measurement, keeps show() synchronous, and is this line.
    //
    // A fixed element above the viewport creates no scrollable overflow, so parking it here costs
    // nothing and moves nothing.
    tip.style.left = "0px";
    tip.style.top = "-9999px";
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
  // HIDING THE PANEL AND RELEASING THE ANCHOR ARE TWO DIFFERENT ACTS, and keeping them fused is
  // what cost every tooltipped control its clicks.
  //
  // `hidePanel()` is visual only. `hide()` also releases the anchor, which means touching the
  // anchor's `aria-describedby`.
  function hidePanel() {
    tip.style.display = "none";
  }
  function hide() {
    if (anchor) removeDescription(anchor);
    anchor = null;
    hidePanel();
  }

  // WRITE THE ARIA ASSOCIATION ONLY WHEN IT WOULD ACTUALLY CHANGE. This is the click fix, and it
  // is one comparison.
  //
  // `mouseover` does not fire once per hover — it fires again whenever the browser re-resolves
  // what is under the cursor. Rewriting `aria-describedby` on the hovered element is itself enough
  // to make it re-resolve, so the old unconditional write was a FEEDBACK LOOP: write -> the hover
  // target is recomputed -> mouseover -> write. The observed cost was not a busy loop but a broken
  // control: while that churn was running, `pointerdown` and `pointerup` still resolved to the
  // button while the compatibility MOUSE events resolved to an ancestor — mousedown and mouseup on
  // the <tbody> — and a `click` is only synthesised when the press and the release agreed on their
  // target. So no click was produced and the handler never ran, on every tooltipped control.
  //
  // BISECTED, not guessed. Mimicking show() line by line against the real page: everything except
  // this write, and the click works and `mouseover` fires ONCE. Add this write unconditionally and
  // the click dies and `mouseover` fires three times. Make the same write conditional and the
  // click comes back — with the attribute still set, so nothing is traded away for it.
  //
  // ⚠️ Do NOT "simplify" these two helpers back into bare setAttribute/removeAttribute calls. The
  // attribute is not the problem; writing it when it already says that is.
  function describe(el) {
    if (el.getAttribute("aria-describedby") !== "ddtip") el.setAttribute("aria-describedby", "ddtip");
  }
  function removeDescription(el) {
    if (el.getAttribute("aria-describedby") === "ddtip") el.removeAttribute("aria-describedby");
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
  // place(), not show(): show() now returns early for the anchor it is already showing, which is
  // the whole click fix. Repositioning is the one case that must still recompute.
  document.addEventListener("scroll", () => anchor && place(), true);
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
  // hidePanel, NOT hide — and this one line is the click fix.
  //
  // This runs in the CAPTURE phase of pointerdown, i.e. between `pointerdown` and `mousedown`.
  // `hide()` removes `aria-describedby` from the element that is being pressed, and mutating that
  // attribute on the element under the cursor makes the browser re-resolve the pointer target: the
  // compatibility MOUSE events then land on an ancestor — `mousedown` and `mouseup` on the
  // <tbody> rather than the <button> — and a `click` is only synthesised when the press and the
  // release agreed. So no click was ever produced and the handler never ran.
  //
  // BISECTED IN THE REAL RUNTIME, not reasoned: commenting out this single listener restores
  // `mousedown:BUTTON` -> `click:BUTTON` on the page that could not be clicked. It is also
  // reachable from the other side — writing the attribute unconditionally on every `mouseover`
  // breaks the same click, because `mouseover` re-fires whenever the hover target is re-resolved
  // and the write is itself what re-resolves it. Both are the same mistake: MUTATING ARIA ON THE
  // ELEMENT UNDER THE POINTER WHILE THE BROWSER IS DECIDING WHERE A GESTURE LANDS.
  //
  // What this listener is FOR is unaffected: a press means "I am done reading", and the panel
  // still disappears on press. It simply no longer touches the anchor to do it.
  //
  // The anchor keeps its `aria-describedby` until the pointer actually leaves it (the mouseover
  // handler's else-branch) or focus moves away (focusout), both of which call the full `hide()`.
  // That is a description the element genuinely still has — it is that element's own data-tip —
  // rather than the stale cross-anchor one the per-show write was introduced to avoid.
  document.addEventListener("pointerdown", hidePanel, true);

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
      // a dropdown's panel is already in the DOM; what ARRIVES is the `open` attribute
      if (record.type === "attributes") {
        if (record.target.matches?.("details.dropdown[open]")) { hide(); return; }
        continue;
      }
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.(".select-panel") || node.querySelector?.(".select-panel")) { hide(); return; }
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
}
