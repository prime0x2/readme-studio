import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { splitIntoSections } from "@/shared";
import { useDocStore } from "../store/useDocStore";
import { MarkdownFileError, readMarkdownFile } from "./markdownFile";

/**
 * Opens a local Markdown file as the document, split into sections. The
 * current sections move to "Deleted sections", like an import from GitHub.
 */
export function useOpenMarkdownFile(): (file: File) => Promise<void> {
  const importDocument = useDocStore((s) => s.importDocument);
  return async (file) => {
    let markdown: string;
    try {
      markdown = await readMarkdownFile(file);
    } catch (err) {
      toast.error(err instanceof MarkdownFileError ? err.message : `Couldn't read “${file.name}”.`);
      return;
    }
    // An untouched blank section isn't kept, so there's nothing to point to.
    const keptPrevious = useDocStore
      .getState()
      .sections.some((s) => !(s.autoName && s.markdown.trim() === ""));
    importDocument(splitIntoSections(markdown), null);
    toast.success(
      keptPrevious
        ? `Opened “${file.name}”. Your previous sections are in Deleted sections.`
        : `Opened “${file.name}”.`,
    );
  };
}

/**
 * Files dragged anywhere over the page: true while a drag with files is over
 * the window. The drop is caught before the editor sees it, so CodeMirror
 * doesn't paste the file's text at the cursor.
 */
export function useFileDrop(onFile: (file: File) => void): boolean {
  const [dragging, setDragging] = useState(false);
  const onFileRef = useRef(onFile);
  onFileRef.current = onFile;

  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;
    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const onOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      depth = 0;
      setDragging(false);
      const files = [...(event.dataTransfer?.files ?? [])];
      const [first] = files;
      if (!first) return;
      onFileRef.current(first);
      if (files.length > 1) toast.info("Opened the first file. Drop one file at a time.");
    };
    const options = { capture: true };
    window.addEventListener("dragenter", onEnter, options);
    window.addEventListener("dragover", onOver, options);
    window.addEventListener("dragleave", onLeave, options);
    window.addEventListener("drop", onDrop, options);
    return () => {
      window.removeEventListener("dragenter", onEnter, options);
      window.removeEventListener("dragover", onOver, options);
      window.removeEventListener("dragleave", onLeave, options);
      window.removeEventListener("drop", onDrop, options);
    };
  }, []);

  return dragging;
}
