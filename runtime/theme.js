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

/**
 * Wire up a theme switcher built from the standard markup:
 *   <button data-theme-value="green">green</button>   (one per theme)
 *   <span data-theme-label></span>                     (shows the active theme)
 * @param {{ faviconHref?: (theme: Theme) => string }} [options]
 */
export function initThemeSwitcher(options) {
  const labels = document.querySelectorAll("[data-theme-label]");
  const syncLabel = () => {
    const theme = document.documentElement.dataset.theme ?? DEFAULT_THEME;
    labels.forEach((label) => {
      label.textContent = theme;
    });
  };
  syncLabel();

  document.querySelectorAll("[data-theme-value]").forEach((button) => {
    button.addEventListener("click", () => {
      const theme = /** @type {HTMLElement} */ (button).dataset.themeValue;
      if (theme) setTheme(/** @type {Theme} */ (theme), options);
      syncLabel();
    });
  });
}
