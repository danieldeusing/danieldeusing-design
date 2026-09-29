/*
 * diagramzoom.js — open any `.diagram` (or any figure, image or svg a selector names) full-screen,
 * then zoom and pan it.
 *
 * Markup contract: whatever the element wraps — a mermaid <svg>, an <img>, a <canvas>. No
 * per-diagram attributes: a diagram is zoomable by virtue of being a diagram, which is the point —
 * an architecture diagram that has to fit a text column is unreadable at exactly the moment someone
 * needs it. pagr passes its article figures, `initDiagramZoom(".prose-pagr :is(figure, p:has(> img))")`,
 * which replaces its hand-rolled lightbox.
 *
 * THE OPENER SAYS WHAT IT OPENS. Each element becomes a real button (role, tabindex, Enter and
 * Space), named "zoom: <the image's alt>" for an image and "zoom diagram" otherwise. It used to say
 * "open diagram, zoomable" for everything, a photograph included. The view takes the same name.
 *
 * THE VIEW IS A MODAL <dialog> (0.60.0), opened through openDialog(): the page behind is inert, Tab
 * stays in the view, Escape closes it, and focus goes back to the opener. It was a
 * `div[role=dialog][aria-modal]` on <body>, which claimed all of that and did none of it — Tab
 * walked out into the page behind. Its bar is the system's: the compact ghost buttons and the
 * dialog's own X (src/overlays.css draws the view).
 *
 * Wheel zooms about the pointer, drag pans, +/-/0 and the bar do the same, and a click on the empty
 * stage closes — a CLICK, not the end of a drag. Pointer capture delivers the click that ends a pan
 * to the stage, and until 0.60.0 that closed the view under the reader's hand after every pan
 * (measured on 0.59.0: drag the artwork 100px and the view is gone).
 *
 * The artwork is CLONED into the view rather than moved: mermaid holds references to the nodes it
 * rendered and re-runs against them (a folded or tabbed diagram is redrawn when it becomes
 * visible), so moving the original out of the document and back is how you get a diagram that
 * silently stops updating.
 */
import { openDialog } from "./dialog.js";

const FIT_MARGIN = 0.92; // leave a little air around a fitted diagram
const MIN_SCALE = 0.2;
const MAX_SCALE = 12;
const DRAG_SLOP = 4; // px a press may wander and still be a click rather than a pan

/* "zoom: network map" for an image with alt text, "zoom image" for one without, "zoom diagram" for
   everything else — the middle case because "diagram" is what the old name called a photograph. */
function nameOf(el) {
  const node = el.querySelector("svg, img, canvas");
  if (node?.tagName !== "IMG") return "zoom diagram";
  const alt = node.getAttribute("alt")?.trim();
  return alt ? `zoom: ${alt}` : "zoom image";
}

export function initDiagramZoom(selector = ".diagram") {
  const diagrams = Array.from(document.querySelectorAll(selector));
  if (!diagrams.length) return;

  let view, stage, art;
  let scale = 1, tx = 0, ty = 0, dragging = false, moved = false, lastX = 0, lastY = 0;

  const apply = () => { art.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; };
  const zoomTo = (next, cx, cy) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    if (clamped === scale) return;
    // keep the point under the cursor stationary
    const rect = stage.getBoundingClientRect();
    const px = (cx ?? rect.left + rect.width / 2) - rect.left - rect.width / 2;
    const py = (cy ?? rect.top + rect.height / 2) - rect.top - rect.height / 2;
    const ratio = clamped / scale;
    tx = px - (px - tx) * ratio;
    ty = py - (py - ty) * ratio;
    scale = clamped;
    apply();
  };

  const fit = () => {
    const node = art.firstElementChild;
    if (!node) return;
    // Measure the artwork at 1x, not through the current transform.
    const prev = art.style.transform;
    art.style.transform = "none";
    const box = node.getBoundingClientRect();
    art.style.transform = prev;
    const s = stage.getBoundingClientRect();
    scale = box.width && box.height
      ? Math.min((s.width * FIT_MARGIN) / box.width, (s.height * FIT_MARGIN) / box.height)
      : 1;
    tx = ty = 0;
    apply();
  };

  const button = (act, label, text) =>
    `<button type="button" class="btn-terminal btn-terminal--ghost btn-terminal--compact" data-dgm="${act}" aria-label="${label}">${text}</button>`;

  const build = () => {
    view = document.createElement("dialog");
    view.className = "dgm-overlay";
    view.innerHTML =
      '<div class="dgm-bar">' +
      button("out", "zoom out", "&minus;") +
      button("reset", "fit to screen", "fit") +
      button("in", "zoom in", "+") +
      '<button type="button" class="btn-icon dialog-close" data-icon="x" data-dgm="close" aria-label="close"></button>' +
      '</div><div class="dgm-stage"><div class="dgm-art"></div></div>';
    document.body.appendChild(view);
    stage = view.querySelector(".dgm-stage");
    art = view.querySelector(".dgm-art");

    view.addEventListener("click", (e) => {
      const act = e.target.closest("[data-dgm]")?.dataset.dgm;
      if (act === "close" || (e.target === stage && !moved)) return view.close();
      if (act === "in") return zoomTo(scale * 1.3);
      if (act === "out") return zoomTo(scale / 1.3);
      if (act === "reset") return fit();
    });
    // Escape is the platform's: it is a modal dialog.
    view.addEventListener("keydown", (e) => {
      if (e.key === "+" || e.key === "=") zoomTo(scale * 1.3);
      else if (e.key === "-") zoomTo(scale / 1.3);
      else if (e.key === "0") fit();
    });
    view.addEventListener("close", () => art.replaceChildren());
    stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      zoomTo(scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY);
    }, { passive: false });
    stage.addEventListener("pointerdown", (e) => {
      dragging = true; moved = false; lastX = e.clientX; lastY = e.clientY;
      stage.setPointerCapture(e.pointerId); stage.classList.add("is-grabbing");
    });
    stage.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (!moved && Math.abs(dx) + Math.abs(dy) < DRAG_SLOP) return;
      moved = true;
      tx += dx; ty += dy;
      lastX = e.clientX; lastY = e.clientY; apply();
    });
    const endDrag = () => { dragging = false; stage.classList.remove("is-grabbing"); };
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
    // An <img> is draggable by default: a few pixels in, the browser starts its own drag of the
    // image, cancels the pointer, and the pan stops where that began — measured, a 120px drag moved
    // the picture 24px. Only an svg had ever panned properly.
    stage.addEventListener("dragstart", (e) => e.preventDefault());
  };

  const open = (source) => {
    const node = source.querySelector("svg, img, canvas");
    if (!node) return;
    if (!view) build();
    // Measure the ORIGINAL while it is still laid out. The clone needs a definite
    // pixel size: a mermaid svg is sized by `width="100%"` plus an inline
    // max-width, and both resolve against a parent — dropping them to "let it
    // fill" gives an svg with only a viewBox, which collapses to 0x0 in an
    // auto-sized box and makes fit() scale nothing (measured exactly that).
    const box = node.getBoundingClientRect();
    const canvas = node instanceof HTMLCanvasElement;
    const copy = node.cloneNode(true);
    copy.style.maxWidth = copy.style.maxHeight = "none";
    if (box.width && box.height) {
      // A canvas's width and height ATTRIBUTES are its resolution, and writing one clears it; the
      // clone keeps the original's, so only its displayed size is set.
      if (!canvas) {
        copy.setAttribute("width", box.width);
        copy.setAttribute("height", box.height);
      }
      copy.style.width = `${box.width}px`;
      copy.style.height = `${box.height}px`;
    }
    // A canvas clones EMPTY — its bitmap is not part of the node — so the view showed a blank box.
    if (canvas) copy.getContext("2d")?.drawImage(node, 0, 0);
    art.replaceChildren(copy);
    view.setAttribute("aria-label", source.getAttribute("aria-label") || nameOf(source));
    openDialog(view, source);
    requestAnimationFrame(fit);
  };

  for (const d of diagrams) {
    if (d.classList.contains("dgm-zoomable")) continue; // already an opener: a second call adds nothing
    d.classList.add("dgm-zoomable");
    d.setAttribute("role", "button");
    d.setAttribute("tabindex", "0");
    d.setAttribute("aria-label", nameOf(d));
    d.addEventListener("click", () => open(d));
    d.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(d); }
    });
  }
}
