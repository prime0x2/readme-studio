import { describe, expect, it } from "vitest";
import { assembleMarkdown, extractTitle, slugifyTitle } from "@/shared/types";

describe("assembleMarkdown", () => {
  it("joins sections with a single blank line and trailing newline", () => {
    const doc = assembleMarkdown([{ markdown: "# A\n\n" }, { markdown: "\n## B\ntext\n\n\n" }]);
    expect(doc).toBe("# A\n\n## B\ntext\n");
  });

  it("skips empty sections", () => {
    expect(assembleMarkdown([{ markdown: "  \n" }, { markdown: "# A" }])).toBe("# A\n");
  });

  it("returns just a newline for no sections", () => {
    expect(assembleMarkdown([])).toBe("\n");
  });
});

describe("extractTitle", () => {
  it("finds the first H1", () => {
    expect(extractTitle("intro\n\n# My Project\n\n# Second")).toBe("My Project");
  });

  it("strips inline formatting and links", () => {
    expect(extractTitle("# **Bold** `code` [linked](https://x.dev)")).toBe("Bold code linked");
  });

  it("returns null when there is no H1", () => {
    expect(extractTitle("## Only h2")).toBeNull();
  });
});

describe("slugifyTitle", () => {
  it("slugifies a normal title", () => {
    expect(slugifyTitle("My Cool Project!")).toBe("my-cool-project");
  });

  it("falls back to readme for empty/symbol-only input", () => {
    expect(slugifyTitle("")).toBe("readme");
    expect(slugifyTitle("***")).toBe("readme");
    expect(slugifyTitle(null)).toBe("readme");
  });

  it("strips diacritics and caps length", () => {
    expect(slugifyTitle("Café Über")).toBe("cafe-uber");
    expect(slugifyTitle("x".repeat(100))).toHaveLength(64);
  });
});
