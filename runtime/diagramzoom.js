/*
 * diagramzoom.js — open any `.diagram` full-screen, then zoom and pan it.
 *
 * Markup contract: whatever `.diagram` wraps (a mermaid <svg>, an <img>). No
 * per-diagram attributes — a diagram is zoomable by virtue of being a diagram,
 * which is the point: an architecture diagram that has to fit a text column is
 * unreadable at exactly the moment someone needs it.
 *
 * Behaviour: click (or Enter/Space — the wrapper becomes a real button, so this
 * works from the keyboard and is announced) opens an overlay with the diagram
 * scaled to FIT the viewport. Wheel zooms about the pointer, drag pans, +/-/0
 * and the on-screen controls do the same. Escape or a click on the backdrop
 * closes and returns focus to the diagram that was opened.
 *
 * The SVG is CLONED into the overlay rather than moved: mermaid holds references
 * to the nodes it rendered and re-runs against them (a folded or tabbed diagram
 * is redrawn when it becomes visible), so moving the original out of the document
 * and back is how you get a diagram that silently stops updating.
 */
const FIT_MARGIN = 0.92; // leave a little air around a fitted diagram
const MIN_SCALE = 0.2;
const MAX_SCALE = 12;

export function initDiagramZoom(selector = ".diagram") {
  const diagrams = Array.from(document.querySelectorAll(selector));
  if (!diagrams.length) return;

  let overlay, stage, art, closeBtn, opener;
  let scale = 1, tx = 0, ty = 0, dragging = false, lastX = 0, lastY = 0;

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

  const build = () => {
    overlay = document.createElement("div");
    overlay.className = "dgm-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "diagram, zoomable");
    overlay.innerHTML =
      '<div class="dgm-bar">' +
      '<button type="button" class="dgm-btn" data-dgm="out" aria-label="zoom out">&minus;</button>' +
      '<button type="button" class="dgm-btn" data-dgm="reset" aria-label="fit to screen">fit</button>' +
      '<button type="button" class="dgm-btn" data-dgm="in" aria-label="zoom in">+</button>' +
      '<button type="button" class="dgm-btn dgm-close" data-dgm="close" aria-label="close">close &times;</button>' +
      "</div><div class=\"dgm-stage\"><div class=\"dgm-art\"></div></div>";
    document.body.appendChild(overlay);
    stage = overlay.querySelector(".dgm-stage");
    art = overlay.querySelector(".dgm-art");
    closeBtn = overlay.querySelector(".dgm-close");

    overlay.addEventListener("click", (e) => {
      const act = e.target.closest("[data-dgm]")?.dataset.dgm;
      if (act === "close" || e.target === stage || e.target === overlay) return close();
      if (act === "in") return zoomTo(scale * 1.3);
      if (act === "out") return zoomTo(scale / 1.3);
      if (act === "reset") return fit();
    });
    stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      zoomTo(scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY);
    }, { passive: false });
    stage.addEventListener("pointerdown", (e) => {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      stage.setPointerCapture(e.pointerId); stage.classList.add("is-grabbing");
    });
    stage.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      tx += e.clientX - lastX; ty += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY; apply();
    });
    const endDrag = () => { dragging = false; stage.classList.remove("is-grabbing"); };
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);

    document.addEventListener("keydown", (e) => {
      if (!overlay.classList.contains("open")) return;
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "+" || e.key === "=") zoomTo(scale * 1.3);
      else if (e.key === "-") zoomTo(scale / 1.3);
      else if (e.key === "0") fit();
    });
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

  const close = () => {
    overlay.classList.remove("open");
    document.documentElement.classList.remove("dgm-locked");
    art.replaceChildren();
    opener?.focus();
  };

  const open = (source) => {
    if (!overlay) build();
    const node = source.querySelector("svg, img, canvas");
    if (!node) return;
    opener = source;
    // Measure the ORIGINAL while it is still laid out. The clone needs a definite
    // pixel size: a mermaid svg is sized by `width="100%"` plus an inline
    // max-width, and both resolve against a parent — dropping them to "let it
    // fill" gives an svg with only a viewBox, which collapses to 0x0 in an
    // auto-sized box and makes fit() scale nothing (measured exactly that).
    const box = node.getBoundingClientRect();
    const copy = node.cloneNode(true);
    copy.style.maxWidth = copy.style.maxHeight = "none";
    if (box.width && box.height) {
      copy.setAttribute("width", box.width);
      copy.setAttribute("height", box.height);
      copy.style.width = `${box.width}px`;
      copy.style.height = `${box.height}px`;
    }
    art.replaceChildren(copy);
    overlay.classList.add("open");
    document.documentElement.classList.add("dgm-locked");
    requestAnimationFrame(fit);
    closeBtn.focus();
  };

  for (const d of diagrams) {
    d.classList.add("dgm-zoomable");
    d.setAttribute("role", "button");
    d.setAttribute("tabindex", "0");
    d.setAttribute("aria-label", "open diagram, zoomable");
    d.addEventListener("click", () => open(d));
    d.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(d); }
    });
  }
}
