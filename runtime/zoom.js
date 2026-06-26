/*
 * danieldeusing-design — resolution-independent zoom.
 *
 * Lays the page out at a fixed reference width, then scales the whole view up
 * to fill wider screens — so 2K / 4K / 8K render the identical layout, just
 * bigger (a true zoom of everything, not font scaling). Never scales below 1×,
 * so screens up to the reference width keep their normal responsive layout.
 *
 * Apply pre-paint (inline, in <head>) to avoid a flash at the unscaled size.
 */

/**
 * @param {number} [referenceWidth=1920] The width the layout is authored for.
 *   On a viewport wider than this, the page is zoomed by viewport/reference.
 */
export function initResolutionZoom(referenceWidth = 1920) {
  const applyZoom = () => {
    // `zoom` is the right primitive here: unlike transform: scale it reflows
    // and keeps the document height correct. Widely supported in evergreen
    // browsers as of 2024.
    document.documentElement.style.zoom = String(Math.max(1, window.innerWidth / referenceWidth));
  };
  applyZoom();
  window.addEventListener("resize", applyZoom);
}
