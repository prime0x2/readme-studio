import type { ReactNode } from "react";
import type { DocumentBase, PreviewTheme } from "@/shared";
import { useRenderedMarkdown } from "../lib/useRenderedMarkdown";

export interface ArticleBlock {
  key: string;
  markdown: string;
  /** Click-to-select (the editor's preview mirrors the sidebar selection). */
  onSelect?: () => void;
}

function RenderedBlock({
  block,
  theme,
  base,
}: {
  block: ArticleBlock;
  theme: PreviewTheme;
  base?: DocumentBase;
}) {
  const html = useRenderedMarkdown(block.markdown, theme, base);
  const { onSelect } = block;
  if (!onSelect) {
    // biome-ignore lint/security/noDangerouslySetInnerHtml: output of the shared pipeline, sanitized by rehype-sanitize
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: click-to-focus mirror of the sidebar selection
    <div
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect();
      }}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: output of the shared pipeline, sanitized by rehype-sanitize
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * A GitHub-styled document. Blocks render independently so editing one
 * section only re-renders that section.
 */
export function MarkdownArticle({
  blocks,
  theme,
  base,
  className = "",
  empty,
}: {
  blocks: ArticleBlock[];
  theme: PreviewTheme;
  /** Where the document lives, for relative image/link URLs. */
  base?: DocumentBase;
  className?: string;
  empty?: ReactNode;
}) {
  return (
    <article className={`markdown-body ${className}`} data-theme={theme}>
      {blocks.length === 0
        ? empty
        : blocks.map((block) => (
            <RenderedBlock key={block.key} block={block} theme={theme} base={base} />
          ))}
    </article>
  );
}
