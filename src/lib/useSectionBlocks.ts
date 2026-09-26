import { useMemo } from "react";
import { assembleMarkdown, referenceDefinitions } from "@/shared";
import type { ArticleBlock } from "../components/MarkdownArticle";
import { useDocStore } from "../store/useDocStore";

/**
 * The document's sections as preview blocks. Each section renders on its
 * own, so the document's reference definitions (`[ci-badge]: https://…`,
 * usually at the bottom of an imported README) are appended to every
 * block; otherwise `[![CI][ci-badge]]` in the header would show as text.
 */
export function useSectionBlocks(select?: (id: string) => void): ArticleBlock[] {
  const sections = useDocStore((s) => s.sections);
  return useMemo(() => {
    const definitions = referenceDefinitions(assembleMarkdown(sections));
    return sections.map((section) => ({
      key: section.id,
      markdown: definitions ? `${section.markdown}\n\n${definitions}` : section.markdown,
      onSelect: select ? () => select(section.id) : undefined,
    }));
  }, [sections, select]);
}
