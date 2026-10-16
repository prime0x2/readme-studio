import type { UiTheme } from "../store/useDocStore";

/**
 * The theme after one click on a theme button. Every click flips what's on
 * screen, and "system" stays reachable: from system, switch to the opposite of
 * what the system shows; from an explicit theme, go back to system when that
 * looks different, otherwise to the opposite theme.
 */
export function nextTheme(theme: UiTheme, systemDark: boolean): UiTheme {
  const system = systemDark ? "dark" : "light";
  const opposite = (t: "light" | "dark") => (t === "dark" ? "light" : "dark");
  if (theme === "system") return opposite(system);
  return theme === system ? opposite(theme) : "system";
}
