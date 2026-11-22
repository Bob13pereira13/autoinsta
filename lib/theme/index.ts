/**
 * Light and dark themes. With no choice saved, the panel follows the system
 * (prefers-color-scheme, handled in app/globals.css); a choice made with the
 * theme button is kept in a cookie, so the server renders the right theme
 * and nothing flashes. Colors live in app/globals.css.
 */
export const THEME_COOKIE = "app-theme";

export type Theme = "light" | "dark";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

/** The saved choice, or null when the panel follows the system. */
export function resolveTheme(value: unknown): Theme | null {
  return isTheme(value) ? value : null;
}
