/*
 * danieldeusing-design — animations on/off toggle.
 *
 * Wires up a footer/chrome control that turns every keyframe animation on or off,
 * persisting the choice so it survives reloads. Pairs with the html.anim-off
 * kill-switch in components.css and the pre-paint gate in terminal.js.
 *
 * Markup contract (style it with the .anim-toggle component class):
 *   <button type="button" class="anim-toggle" data-anim-toggle aria-pressed="true">
 *     <span data-anim-box aria-hidden="true">[x]</span>
 *     <span>anim</span>
 *   </button>
 *
 * The persisted key is "anim" ("on" | "off"); apply it pre-paint (inline, in
 * <head>) the same way the theme is applied, so the choice never flashes.
 */

export function initAnimToggle() {
  const toggles = Array.from(document.querySelectorAll("[data-anim-toggle]"));
  if (!toggles.length) return;

  const sync = () => {
    const on = !document.documentElement.classList.contains("anim-off");
    for (const toggle of toggles) {
      toggle.setAttribute("aria-pressed", String(on));
      const box = toggle.querySelector("[data-anim-box]");
      if (box) box.textContent = on ? "[x]" : "[ ]";
    }
  };
  sync();

  for (const toggle of toggles) {
    toggle.addEventListener("click", () => {
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
  }
}
