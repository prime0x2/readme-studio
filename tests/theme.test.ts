import { describe, expect, it } from "vitest";
import { nextTheme } from "../src/lib/theme";

describe("nextTheme", () => {
  it("leaves system for the opposite of what the system shows", () => {
    expect(nextTheme("system", false)).toBe("dark");
    expect(nextTheme("system", true)).toBe("light");
  });

  it("returns to system when that changes what's on screen", () => {
    expect(nextTheme("dark", false)).toBe("system");
    expect(nextTheme("light", true)).toBe("system");
  });

  it("flips an explicit theme that matches the system", () => {
    expect(nextTheme("light", false)).toBe("dark");
    expect(nextTheme("dark", true)).toBe("light");
  });

  it("changes what's on screen on every click", () => {
    const shown = (t: string, systemDark: boolean) =>
      t === "system" ? (systemDark ? "dark" : "light") : t;
    for (const systemDark of [false, true]) {
      for (const theme of ["light", "dark", "system"] as const) {
        expect(shown(nextTheme(theme, systemDark), systemDark)).not.toBe(shown(theme, systemDark));
      }
    }
  });
});
