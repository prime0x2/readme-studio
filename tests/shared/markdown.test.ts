import { describe, expect, it } from "vitest";
import { extractMermaidBlocks, parseMarkdown, renderMarkdown } from "@/shared/markdown";

describe("mermaid diagrams", () => {
  const doc = "intro\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\n```js\nx()\n```";

  it("extracts diagram sources in order", () => {
    expect(extractMermaidBlocks(doc)).toEqual(["flowchart LR\n  A --> B"]);
  });

  it("swaps a diagram block for the renderer's SVG", async () => {
    const seen: string[] = [];
    const html = await renderMarkdown(doc, {
      renderDiagram: async (code) => {
        seen.push(code);
        return '<svg id="d"><g></g></svg>';
      },
    });
    expect(seen).toEqual(["flowchart LR\n  A --> B"]);
    expect(html).toContain('<div class="mermaid-diagram"><svg id="d"><g></g></svg></div>');
    expect(html).not.toContain("flowchart LR");
  });

  it("keeps the code block when there is no renderer or it fails", async () => {
    for (const renderDiagram of [undefined, async () => null]) {
      const html = await renderMarkdown(doc, { renderDiagram });
      // Shiki highlights mermaid, so compare the text, not the markup.
      expect(html.replace(/<[^>]+>/g, "")).toContain("flowchart LR");
      expect(html).toContain("<pre");
      expect(html).not.toContain("mermaid-diagram");
    }
  });

  it("still sanitizes raw HTML written by the user", async () => {
    const html = await renderMarkdown(
      '<svg><script>alert(1)</script></svg>\n\n<img src=x onerror="alert(1)">',
      {
        renderDiagram: async () => null,
      },
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });
});

describe("renderMarkdown", () => {
  it("renders GFM tables", async () => {
    const html = await renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>a</th>");
    expect(html).toContain("<td>2</td>");
  });

  it("renders task lists with checkboxes", async () => {
    const html = await renderMarkdown("- [x] done\n- [ ] todo");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
    expect(html).toContain("task-list-item");
  });

  it("converts emoji shortcodes", async () => {
    const html = await renderMarkdown("ship it :rocket:");
    expect(html).toContain("🚀");
  });

  it("renders strikethrough and autolinks", async () => {
    const html = await renderMarkdown("~~gone~~ visit https://example.com");
    expect(html).toContain("<del>gone</del>");
    expect(html).toContain('<a href="https://example.com"');
  });

  it("highlights fenced code with Shiki token spans", async () => {
    const html = await renderMarkdown("```ts\nconst x: number = 1;\n```");
    expect(html).toContain("shiki");
    expect(html).toMatch(/<span style="color:#[0-9A-Fa-f]{6}/);
  });

  it("falls back to plain rendering for unknown languages", async () => {
    const html = await renderMarkdown("```nosuchlang\nhello\n```");
    expect(html).toContain("hello");
    expect(html).toContain("<pre");
  });

  it("keeps allowed inline HTML (img, align, details)", async () => {
    const html = await renderMarkdown(
      '<p align="center"><img src="https://img.shields.io/badge/a-b-c.svg" alt="badge" width="120"></p>\n\n<details><summary>More</summary>\n\nhidden\n\n</details>',
    );
    expect(html).toContain('align="center"');
    expect(html).toContain('width="120"');
    expect(html).toContain("<details>");
    expect(html).toContain("<summary>More</summary>");
  });

  it("strips dangerous HTML (XSS)", async () => {
    const html = await renderMarkdown(
      '<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n[x](javascript:alert(1))',
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
  });

  it("renders dark theme tokens when asked", async () => {
    const light = await renderMarkdown("```js\nconst a = 1;\n```", { theme: "light" });
    const dark = await renderMarkdown("```js\nconst a = 1;\n```", { theme: "dark" });
    expect(light).not.toBe(dark);
    expect(dark).toContain("github-dark");
  });
});

describe("parseMarkdown", () => {
  it("produces an mdast tree with GFM nodes and emoji applied", () => {
    const tree = parseMarkdown("| a |\n|---|\n| 1 |\n\n- [ ] task :tada:");
    const types = tree.children.map((c) => c.type);
    expect(types).toContain("table");
    expect(types).toContain("list");
    expect(JSON.stringify(tree)).toContain("🎉");
  });
});
