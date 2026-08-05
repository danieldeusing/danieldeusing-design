/*
 * lsnav.js — show/hide for the `ls -l` site rail (src/chrome.css).
 *
 * Markup contract:
 *   <div class="ls-nav" id="nav">
 *     <div class="ls-nav-head">
 *       <span class="ls-nav-title">ls -l</span>
 *       <button class="ls-nav-hide" data-ls-nav-toggle aria-controls="nav" aria-expanded="true">»</button>
 *     </div>
 *     <ul class="ls-panel">…</ul>
 *   </div>
 *   <button class="ls-nav-show" data-ls-nav-toggle aria-controls="nav">« ls -l</button>
 *
 * THIS MODULE DOES NOT APPLY THE INITIAL STATE, and that is deliberate. It is a
 * module at the end of <body>, so anything it does happens after first paint: a
 * reader who hid the rail would watch it paint and then jump away on every page
 * load. The state is applied by an inline <head> script instead —
 *
 *   try { if (localStorage.getItem("ls-nav") === "off")
 *           document.documentElement.dataset.lsNav = "off"; } catch {}
 *
 * — and this module only reads that, wires the clicks, and writes back. Shown is
 * the default, so an absent key and a failed read both land on "shown", which is
 * the state that is correct when in doubt.
 *
 * Every [data-ls-nav-toggle] toggles, so the hide button inside the rail and the
 * tab that replaces it share one handler and one aria-expanded truth.
 */
const KEY = "ls-nav";

export function initLsNav() {
  const root = document.documentElement;
  const toggles = document.querySelectorAll("[data-ls-nav-toggle]");
  if (!toggles.length) return;

  const shown = () => root.dataset.lsNav !== "off";
  const sync = () => {
    for (const button of toggles) button.setAttribute("aria-expanded", String(shown()));
  };

  sync(); // the inline script set the state; the buttons have not been told yet

  for (const button of toggles) {
    button.addEventListener("click", () => {
      const next = !shown();
      root.dataset.lsNav = next ? "on" : "off";
      // A rail the reader hid should stay hidden on the next page. Wrapped
      // because a locked-down browser throws on write and a nav that cannot
      // remember is still a working nav.
      try {
        localStorage.setItem(KEY, next ? "on" : "off");
      } catch {}
      sync();
    });
  }
}
