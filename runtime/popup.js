/*
 * popup.js — where a popup list goes: under its anchor, or over it when that is where the room is.
 *
 *   positionPopup(panel, anchor, { gap, edge, minWidth, align, side }) -> { side }
 *
 * ONE COPY OF THE GEOMETRY. select.js carried its own `position()` since 0.21.0; configr carried a
 * second in `useMenuPlacement`, and the context menu (M2) and the autocomplete list (M13) each need
 * the same answer again. The flip-and-clamp arithmetic is the kind that is wrong in a subtly
 * different way in every copy of it, so it lives here once and select.js imports it.
 *
 * `anchor` is an Element or a point `{ x, y }` in viewport coordinates — the same space as a
 * MouseEvent's clientX/clientY and getBoundingClientRect(). A context menu is opened by a pointer,
 * not by an element, and a pointer is a box with no size.
 *
 * What it writes, all inline on the panel, because the panel is out of the flow and nothing in a
 * stylesheet can know where its anchor is:
 *   position: fixed, left, top      — the placement
 *   min-inline-size                 — max(anchor width, minWidth): the list is never narrower than
 *                                     the control that opened it
 *   max-inline-size, max-block-size — the room the viewport actually leaves, minus `edge`
 *
 * The panel carries no position of its own in CSS (M0: `.select-panel` is `z-index: 60` and
 * nothing else about placement), so a framework can put the class on its own panel and position
 * it however its library does.
 */

// A list with no room at all still shows about three rows rather than collapsing to nothing. It
// then overhangs the viewport edge, which beats a 0px list nobody can use.
const MIN_ROOM = 72;

/*
 * Consumers can set `zoom` on <html>, and that puts the two halves of any positioning sum in
 * different coordinate spaces: getBoundingClientRect() and innerWidth/innerHeight are VISUAL px,
 * already multiplied, while style.left is a CSS length the browser multiplies AGAIN on the way out.
 * Writing a rect straight into a length therefore applies the zoom twice — an error that grows with
 * distance from the origin, which is how it survives review (it looks fine near the top left). Fixed
 * three times before in this runtime: tooltip.js, lsnav.js and select.js. Divide on the WRITE; never
 * "fix" a comparison whose operands are both already visual.
 */
const zoomOf = () => Number(getComputedStyle(document.documentElement).zoom) || 1;

/**
 * Place a popup list against an element or a point.
 *
 * @param {HTMLElement} panel The popup. Must already be in the document.
 * @param {Element | {x: number, y: number}} anchor What it opens from.
 * @param {object} [options]
 * @param {number} [options.gap=4]       Visual px between the anchor and the panel.
 * @param {number} [options.edge=8]      Keep the panel this far off every viewport edge.
 * @param {number} [options.minWidth=0]  A floor under the anchor's own width, in CSS px.
 * @param {"start"|"end"} [options.align="start"] "end" lines the panel's right edge up with the
 *   anchor's — a trigger at the end of a toolbar.
 * @param {"below"|"above"} [options.side] Keep this side instead of choosing one. For a panel that
 *   changes height while open (a list being filtered): re-choosing on every keystroke would jump
 *   the search box the reader is typing in from one side of the trigger to the other.
 * @returns {{side: "below"|"above"}}
 */
export function positionPopup(panel, anchor, { gap = 4, edge = 8, minWidth = 0, align = "start", side } = {}) {
  const zoom = zoomOf();
  const point = !(anchor instanceof Element);
  const rect = point
    ? { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y }
    : anchor.getBoundingClientRect(); // visual px
  // offsetWidth is a LAYOUT length, already in the same space as the panel's own min-inline-size,
  // so it must NOT be divided. Mixing the two is the trap. (An SVG anchor has no offsetWidth.)
  const anchorWidth = point ? 0 : anchor.offsetWidth ?? rect.width / zoom;

  // Measuring clears max-block-size, and a list scrolled to its middle would come back at the top:
  // the scroll offset is clamped the moment the box grows to show everything. Kept and put back.
  const scrolled = panel.scrollTop;

  // PARK IT OFF-SCREEN TO MEASURE IT, NEVER AT THE VIEWPORT ORIGIN — the rule tooltip.js learned the
  // expensive way. The panel has to be measured UNCONSTRAINED (a fixed box with only `left` set gets
  // `viewport - left` of room, so measuring it where it last sat under-reports its width), and
  // parking it at `top: 0` drops it under a pointer that is mid-click: the compatibility mouse
  // events then resolve to an ancestor and no `click` is ever produced. Above the viewport it can be
  // under nothing, and a fixed box there creates no scrollable overflow.
  panel.style.position = "fixed";
  panel.style.left = "0px";
  panel.style.top = "-9999px";
  panel.style.minInlineSize = `${Math.max(anchorWidth, minWidth)}px`;
  panel.style.maxInlineSize = `${(window.innerWidth - edge * 2) / zoom}px`;
  panel.style.maxBlockSize = "";

  const below = window.innerHeight - rect.bottom - gap - edge;
  const above = rect.top - gap - edge;
  const wanted = panel.getBoundingClientRect().height;
  // Flip only when flipping actually helps. A long list near the bottom of a tall page has room in
  // neither direction, and flipping it there just moves the clipping to the other end.
  const up = side ? side === "above" : wanted > below && above > below;
  const room = Math.max(up ? above : below, MIN_ROOM);
  // The room is for the WHOLE box, and on a content-box panel max-block-size does not count its
  // padding and edges — so the clamp let them spill past the viewport edge by that much (6.8px on
  // 0.59.0's panel, measured: bottom at 698.8 of 700 when it promised 692). Subtracting what the
  // box model adds keeps the promise whatever box-sizing a framework's own panel uses.
  const style = getComputedStyle(panel);
  const frame = style.boxSizing === "border-box"
    ? 0
    : parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
      + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  if (wanted > room) panel.style.maxBlockSize = `${room / zoom - frame}px`;

  const box = panel.getBoundingClientRect(); // visual px, after the clamp
  const wantX = align === "end" ? rect.right - box.width : rect.left;
  const x = Math.min(Math.max(wantX, edge), Math.max(edge, window.innerWidth - box.width - edge));
  const y = up ? rect.top - gap - box.height : rect.bottom + gap;
  panel.style.left = `${x / zoom}px`;
  panel.style.top = `${y / zoom}px`;
  panel.scrollTop = scrolled;
  return { side: up ? "above" : "below" };
}
