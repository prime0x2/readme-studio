import { MARKDOWN_BYTE_LIMIT } from "@/shared";

const MARKDOWN_NAME = /\.(md|markdown|mdown|mkd|mkdn|mdx|txt)$/i;

/** For the file picker: Markdown and plain-text files. */
export const MARKDOWN_FILE_ACCEPT =
  ".md,.markdown,.mdown,.mkd,.mkdn,.mdx,.txt,text/markdown,text/plain";

/** A file that can't be opened, with a message that can be shown as-is. */
export class MarkdownFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarkdownFileError";
  }
}

/**
 * Reads a picked or dropped file as Markdown: a Markdown or text file, at
 * most 1 MB (the editor's document limit), without a byte-order mark.
 */
export async function readMarkdownFile(file: File): Promise<string> {
  if (!MARKDOWN_NAME.test(file.name) && !file.type.startsWith("text/")) {
    throw new MarkdownFileError(`“${file.name}” isn't a Markdown file. Open a .md file instead.`);
  }
  if (file.size > MARKDOWN_BYTE_LIMIT) {
    throw new MarkdownFileError(`“${file.name}” is too large to open (the limit is 1 MB).`);
  }
  const text = await file.text();
  if (text.includes("\u0000")) {
    throw new MarkdownFileError(`“${file.name}” isn't a text file.`);
  }
  return text.replace(/^﻿/, "");
}
