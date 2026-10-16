import { describe, expect, it } from "vitest";
import { MarkdownFileError, readMarkdownFile } from "../src/lib/markdownFile";
import { MARKDOWN_BYTE_LIMIT } from "../src/shared";

const file = (content: BlobPart, name: string, type = "") => new File([content], name, { type });

describe("readMarkdownFile", () => {
  it("reads Markdown and plain-text files", async () => {
    expect(await readMarkdownFile(file("# Aurora\n", "README.md"))).toBe("# Aurora\n");
    expect(await readMarkdownFile(file("notes", "NOTES.markdown"))).toBe("notes");
    expect(await readMarkdownFile(file("plain", "readme", "text/plain"))).toBe("plain");
  });

  it("drops a byte-order mark", async () => {
    expect(await readMarkdownFile(file("﻿# Title", "README.md"))).toBe("# Title");
  });

  it("refuses other file types", async () => {
    await expect(readMarkdownFile(file("x", "logo.png", "image/png"))).rejects.toThrow(
      "“logo.png” isn't a Markdown file.",
    );
  });

  it("refuses files over the 1 MB document limit", async () => {
    const big = file("x".repeat(MARKDOWN_BYTE_LIMIT + 1), "huge.md");
    await expect(readMarkdownFile(big)).rejects.toThrow("too large to open");
  });

  it("refuses binary content behind a .md name", async () => {
    const binary = file(new Uint8Array([0x23, 0x00, 0x01]), "fake.md");
    await expect(readMarkdownFile(binary)).rejects.toBeInstanceOf(MarkdownFileError);
  });
});
