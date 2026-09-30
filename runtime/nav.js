/*
 * nav.js — mobile burger navigation for the chrome kit (src/chrome.css).
 *
 * Markup contract:
 *   <button class="nav-burger" data-nav-toggle aria-controls="site-nav" aria-expanded="false">…</button>
 *   <nav id="site-nav" class="site-nav">…</nav>
 *
 * Toggles `.open` on the nav, keeps aria-expanded in sync, and closes on
 * outside click. Desktop is untouched (the burger is display:none above the
 * 48rem breakpoint).
 */
const wired = new WeakSet();

export function initBurgerNav() {
  const burger = document.querySelector("[data-nav-toggle]");
  const nav = document.getElementById("site-nav");
  // Once per burger: two click listeners on one toggle opened and closed it in the same press.
  if (!burger || !nav || wired.has(burger)) return;
  wired.add(burger);

  burger.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    burger.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("click", (event) => {
    if (!nav.classList.contains("open")) return;
    if (event.target.closest("#site-nav") || event.target.closest("[data-nav-toggle]")) return;
    nav.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
  });

  // On `window`, so it runs after every document-level handler whatever the init order, and only if
  // none of them took the key: a menu open inside the nav cancels its own Escape, and one press
  // closes one layer, not both.
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || !nav.classList.contains("open")) return;
    nav.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
    burger.focus();
  });
}
