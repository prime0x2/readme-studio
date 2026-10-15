import { describe, expect, it } from "vitest";
import { firstHeading, sectionLabel } from "../../src/shared";

const auto = (markdown: string) => ({ name: "Untitled", markdown, autoName: true });

describe("sectionLabel", () => {
  it("uses the stored name for ordinary sections", () => {
    expect(sectionLabel({ name: "Installation", markdown: "# Something else" })).toBe(
      "Installation",
    );
  });

  it("names an auto-named section after its first heading, at any level", () => {
    expect(sectionLabel(auto("# Aurora\n\nA site generator."))).toBe("Aurora");
    expect(sectionLabel(auto("Intro text\n\n## Usage\n\n# Later"))).toBe("Usage");
  });

  it("drops inline Markdown and closing hashes", () => {
    expect(firstHeading("## **Fast** `start` [guide](https://x.dev) ##")).toBe("Fast start guide");
  });

  it("falls back to Untitled without a heading", () => {
    expect(sectionLabel(auto(""))).toBe("Untitled");
    expect(sectionLabel(auto("just text"))).toBe("Untitled");
    expect(sectionLabel(auto("#hashtag is not a heading"))).toBe("Untitled");
    expect(sectionLabel(auto("#   "))).toBe("Untitled");
  });
});
