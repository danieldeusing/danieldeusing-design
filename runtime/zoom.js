/*
 * danieldeusing-design — resolution scaling.
 *
 * SUPERSEDED IN 0.29.0. Scaling above the reference width is now done in CSS,
 * by `tokens.css` moving the ROOT FONT SIZE:
 *
 *   font-size: max(1rem, calc(1rem + (100vw - 1920px) / 120));
 *
 * Above 1920 that reduces to 100vw/120 — precisely `16px * innerWidth/1920`,
 * the curve this module used to draw with `zoom`. Nothing changes size; the
 * mechanism changed.
 *
 * WHY. `zoom` scales the coordinate SPACE, which leaves the page with a pixel
 * grid that no longer matches the browser's. Anything injected into the
 * document from outside it — a password manager's dropdown, a translation bar,
 * an extension overlay — measures a field through the browser's grid and writes
 * the answer back into the page's, where it is multiplied again. Measured on
 * the family login page: 1Password's dropdown landed 1.9x down and across from
 * the field it belonged to, on a window whose zoom factor was 1.89.
 *
 * The same double-multiplication had already been paid for three times INSIDE
 * this runtime — tooltip.js, lsnav.js and select.js all divide by the zoom
 * before writing a length. Those divisions stay: they resolve to 1 once no
 * consumer sets zoom, and they are still correct for a surface that has not
 * migrated yet. Scaling the unit rather than the space removes the second grid
 * altogether, so there is nothing left to compensate for.
 */

/**
 * No longer does anything. Kept exported so a surface can bump its pin without
 * its <head> having to change in the same commit.
 *
 * @deprecated since 0.29.0 — scaling is CSS now. Delete the call, and delete
 *   any inline pre-paint zoom block with it. A page that still assigns
 *   `document.documentElement.style.zoom` AND loads 0.29.0 scales TWICE.
 * @param {number} [referenceWidth=1920] Ignored.
 */
export function initResolutionZoom(referenceWidth = 1920) {
  void referenceWidth;
}
