import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/shared/markdown";
import { referenceDefinitions, splitIntoSections } from "@/shared/split-sections";
import { assembleMarkdown } from "@/shared/types";

describe("splitIntoSections", () => {
  const readme = [
    '<h1 align="center">My Project</h1>',
    "",
    "[![build](https://x.dev/b.svg)](https://x.dev)",
    "",
    "## Install",
    "",
    "```sh",
    "## not a heading, it's a comment",
    "npm i my-project",
    "```",
    "",
    "### Requirements",
    "",
    "- node",
    "",
    "## ⚡ Usage & `API`",
    "",
    "Use it.",
    "",
  ].join("\n");

  it("splits at ## headings, keeping deeper headings and code intact", () => {
    const sections = splitIntoSections(readme);
    expect(sections.map((s) => s.name)).toEqual(["Header", "Install", "⚡ Usage & API"]);
    expect(sections[1]?.markdown).toContain("## not a heading");
    expect(sections[1]?.markdown).toContain("### Requirements");
  });

  it("round-trips: joining the sections reproduces the document", () => {
    expect(assembleMarkdown(splitIntoSections(readme))).toBe(`${readme.trimEnd()}\n`);
  });

  it("names the lead section after a markdown # title", () => {
    const sections = splitIntoSections("# Tool\n\nIntro\n\n## One\n\ntext\n");
    expect(sections.map((s) => s.name)).toEqual(["Tool", "One"]);
  });

  it("falls back to # headings, and to a single section", () => {
    expect(splitIntoSections("# A\n\nx\n\n# B\n\ny").map((s) => s.name)).toEqual(["A", "B"]);
    expect(splitIntoSections("just text")).toEqual([{ name: "Header", markdown: "just text" }]);
    expect(splitIntoSections("   ")).toEqual([]);
  });
});

describe("splitIntoSections — review fixes", () => {
  it("never cuts a <details> element at a heading inside it", () => {
    const md =
      "## Intro\n\n<details>\n<summary>x</summary>\n\n## Inside\n\ntext\n\n</details>\n\n## After\n";
    const sections = splitIntoSections(md);
    expect(sections.map((s) => s.name)).toEqual(["Intro", "After"]);
    expect(sections[0]?.markdown).toContain("</details>");
  });

  it("splits Windows-authored READMEs on the right boundaries", () => {
    const sections = splitIntoSections("# T\r\n\r\nintro\r\n\r\n## One\r\n\r\ntext\r\n");
    expect(sections.map((s) => s.name)).toEqual(["T", "One"]);
    expect(sections[1]?.markdown).toBe("## One\n\ntext");
  });
});

describe("referenceDefinitions", () => {
  it("collects link/image definitions so split sections can resolve them", async () => {
    const readme =
      "[![CI][ci-badge]][ci]\n\n## Usage\n\nrun it\n\n[ci-badge]: https://x.test/b.svg\n[ci]: https://x.test/ci\n";
    const defs = referenceDefinitions(readme);
    expect(defs).toBe("[ci-badge]: https://x.test/b.svg\n[ci]: https://x.test/ci");
    const [header] = splitIntoSections(readme);
    const html = await renderMarkdown(`${header?.markdown}\n\n${defs}`);
    expect(html).toContain('<img src="https://x.test/b.svg"');
    expect(html).not.toContain("[ci-badge]");
  });

  it("is empty when there are none", () => {
    expect(referenceDefinitions("# Title\n\n[not a def] text")).toBe("");
  });
});
