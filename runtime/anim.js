/*
 * danieldeusing-design — animations on/off toggle.
 *
 * Wires up a footer/chrome control that turns every animation on or off, persisting
 * the choice so it survives reloads. Pairs with the html.anim-off kill-switch in
 * tokens.css and the pre-paint gate in terminal.js.
 *
 * Markup contract (style it with the .anim-toggle component class):
 *   <button type="button" class="anim-toggle" data-anim-toggle aria-pressed="true"
 *           aria-label="Toggle animations">
 *     <span data-anim-box aria-hidden="true">[x]</span>
 *     <span>anim</span>
 *   </button>
 *
 * A toggle whose wording flips with the state names both words on itself and marks where they go:
 *   <button … data-anim-toggle data-label-on="enabled" data-label-off="disabled">
 *     <span data-anim-box aria-hidden="true">[x]</span> <span data-anim-label>enabled</span>
 *   </button>
 * The words come from the markup so a translated page supplies its own; a label with no
 * data-label-on/off is left as written. The flipping word is decoration beside the accessible
 * name — the name says what the button does, aria-pressed says whether it is on.
 *
 * Every [data-anim-toggle] on the page shows the same state, including one rendered after this
 * call: the footer's, the burger's copy of it, and any other (danieldeusing.de's home banner has a
 * third) — which is what danieldeusing.de forked this file for, before it wrote the label.
 *
 * The persisted key is "anim" ("on" | "off"); apply it pre-paint (inline, in
 * <head>) the same way the theme is applied, so the choice never flashes.
 */
const TOGGLE = "[data-anim-toggle]";
let wired = false;

function sync() {
  const on = !document.documentElement.classList.contains("anim-off");
  for (const toggle of document.querySelectorAll(TOGGLE)) {
    toggle.setAttribute("aria-pressed", String(on));
    const box = toggle.querySelector("[data-anim-box]");
    if (box) box.textContent = on ? "[x]" : "[ ]";
    const label = toggle.querySelector("[data-anim-label]");
    const text = toggle.getAttribute(on ? "data-label-on" : "data-label-off");
    if (label && text !== null) label.textContent = text;
  }
}

export function initAnimToggle() {
  sync();
  if (wired) return;
  wired = true;

  // Delegated, so a toggle rendered after this call switches like the ones in the markup.
  document.addEventListener("click", (event) => {
    const toggle = event.target instanceof Element ? event.target.closest(TOGGLE) : null;
    if (!toggle) return;
    const html = document.documentElement;
    const turningOff = !html.classList.contains("anim-off");
    if (turningOff) {
      html.classList.add("anim-off");
      html.classList.remove("term-anim"); // stop the terminal typing mid-run
    } else {
      html.classList.remove("anim-off");
    }
    try {
      localStorage.setItem("anim", turningOff ? "off" : "on");
    } catch {
      /* private mode */
    }
    sync();
  });

  // A toggle added later is told the current state at once, not on the next press.
  new MutationObserver((records) => {
    const added = records.some((record) =>
      [...record.addedNodes].some((node) => node instanceof Element && (node.matches(TOGGLE) || node.querySelector(TOGGLE))),
    );
    if (added) sync();
  }).observe(document.documentElement, { childList: true, subtree: true });
}
