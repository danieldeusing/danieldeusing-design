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
export function initBurgerNav() {
  const burger = document.querySelector("[data-nav-toggle]");
  const nav = document.getElementById("site-nav");
  if (!burger || !nav) return;

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

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !nav.classList.contains("open")) return;
    nav.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
    burger.focus();
  });
}
