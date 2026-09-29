/*
 * danieldeusing-design — theme runtime.
 *
 * Framework-agnostic theme switching for the four terminal variants. No
 * dependencies. The active theme lives in html[data-theme] and persists in
 * localStorage under "theme".
 *
 * To avoid a flash of the wrong theme, call applyStoredTheme() from an inline
 * <head> script BEFORE first paint (see the snippet in the README). Then call
 * initThemeSwitcher() after the DOM is ready to wire up the toggle controls.
 */

/** @typedef {"warm" | "green" | "mono" | "paper"} Theme */

/** All available themes, in menu order. */
export const THEMES = /** @type {const} */ (["warm", "green", "mono", "paper"]);

/** Each theme's background, mirrored into <meta name="theme-color"> for mobile chrome. */
export const THEME_BACKGROUNDS = {
  warm: "#f5efe2",
  green: "#020604",
  mono: "#050505",
  paper: "#fafafa",
};

const STORAGE_KEY = "theme";
const DEFAULT_THEME = "warm";

/** The persisted theme, or "warm" if none/invalid. */
export function getStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.includes(/** @type {Theme} */ (stored))) return stored;
  } catch {
    /* localStorage can throw in private mode / sandboxed frames */
  }
  return DEFAULT_THEME;
}

/**
 * Apply a theme to <html> and sync the meta theme-color. Does NOT persist —
 * use setTheme() for that.
 *
 * @param {Theme} theme
 * @param {{ faviconHref?: (theme: Theme) => string }} [options]
 *   faviconHref, if given, also updates <link id="favicon"> — useful for apps
 *   that ship a per-theme favicon. Omit to leave the favicon untouched.
 */
export function applyTheme(theme, options = {}) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_BACKGROUNDS[theme] ?? THEME_BACKGROUNDS[DEFAULT_THEME]);
  if (options.faviconHref) {
    document.getElementById("favicon")?.setAttribute("href", options.faviconHref(theme));
  }
}

/**
 * Persist and apply a theme. No-op for an unknown theme name.
 * @param {Theme} theme
 * @param {{ faviconHref?: (theme: Theme) => string }} [options]
 */
export function setTheme(theme, options) {
  if (!THEMES.includes(theme)) return;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme, options);
}

/**
 * Apply the persisted theme. Call this pre-paint (inline, in <head>) to prevent
 * a flash of the default theme on load.
 * @param {{ faviconHref?: (theme: Theme) => string }} [options]
 */
export function applyStoredTheme(options) {
  applyTheme(getStoredTheme(), options);
}

const CONTROLS = "[data-theme-value], [data-theme-label]";
let switcherOptions;
let switcherWired = false;

/*
 * THE ACTIVE THEME IS A STATE, NOT A COLOUR (0.60.0). It used to be marked only by a stylesheet
 * rule per theme — `html[data-theme="green"] .dropdown-item[data-theme-value="green"]` painted in
 * --primary with a glow — so a screen reader heard four identical buttons and no hint which one
 * was in force. The state now lives on the item, where both the reader and the stylesheet read it:
 *   · inside a dropdown menu the items are `role="menuitemradio"` with `aria-checked`, which is
 *     what an APG menu of one-of-several settings is, and what draws the ✓ (components.css);
 *   · anywhere else (the burger's inline list) a menuitem role would claim a menu that is not
 *     there, so the item is a toggle button with `aria-pressed`, which draws the same ✓.
 * Re-synced on every theme change from ANY source — a pick here, setTheme() from page code, a
 * reload — because the observer watches html[data-theme] itself rather than trusting a click.
 */
function syncThemeControls() {
  const theme = document.documentElement.dataset.theme ?? DEFAULT_THEME;
  for (const label of document.querySelectorAll("[data-theme-label]")) {
    if (label.textContent !== theme) label.textContent = theme;
  }
  for (const item of document.querySelectorAll("[data-theme-value]")) {
    const chosen = String(item.getAttribute("data-theme-value") === theme);
    if (item.closest("details.dropdown .dropdown-panel")) {
      item.setAttribute("role", "menuitemradio");
      item.setAttribute("aria-checked", chosen);
    } else {
      item.setAttribute("aria-pressed", chosen);
    }
  }
}

/**
 * Wire up every theme switcher built from the standard markup, including ones rendered later:
 *   <button data-theme-value="green">green</button>   (one per theme)
 *   <span data-theme-label></span>                     (shows the active theme)
 * Items inside a `details.dropdown` become `menuitemradio` + `aria-checked`; items elsewhere carry
 * `aria-pressed`. Call once; a second call only replaces the options.
 * @param {{ faviconHref?: (theme: Theme) => string }} [options]
 */
export function initThemeSwitcher(options) {
  switcherOptions = options;
  syncThemeControls();
  if (switcherWired) return;
  switcherWired = true;

  // Delegated, so a switcher rendered after this call still switches.
  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-theme-value]") : null;
    const theme = button?.getAttribute("data-theme-value");
    if (!theme) return;
    setTheme(/** @type {Theme} */ (theme), switcherOptions);
    syncThemeControls();
    // close the enclosing dropdown after a pick (no-op if not inside one)
    button.closest("details.dropdown")?.removeAttribute("open");
  });

  new MutationObserver((records) => {
    const relevant = records.some(
      (record) =>
        record.type === "attributes" ||
        [...record.addedNodes].some((node) => node instanceof Element && (node.matches(CONTROLS) || node.querySelector(CONTROLS))),
    );
    if (relevant) syncThemeControls();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"], childList: true, subtree: true });
}
