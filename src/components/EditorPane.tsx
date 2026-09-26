import { FileText, RotateCcw, Trash2 } from "lucide-react";
import { useDocStore } from "../store/useDocStore";
import { CodeMirrorEditor } from "./CodeMirrorEditor";

export function EditorPane({ isDark }: { isDark: boolean }) {
  const section = useDocStore((s) => s.sections.find((x) => x.id === s.selectedId));
  const updateSection = useDocStore((s) => s.updateSection);
  const resetSection = useDocStore((s) => s.resetSection);
  const removeSection = useDocStore((s) => s.removeSection);
  const epoch = useDocStore((s) => s.epoch);

  if (!section) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <FileText size={32} className="text-stone-300 dark:text-stone-700" />
        <p className="max-w-[28ch] text-sm text-stone-500 dark:text-stone-400">
          Select a section to edit it — or add one from the sidebar to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-stone-200 px-4 py-2.5 dark:border-stone-800">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800 dark:text-stone-200">
          {section.name}
        </h2>
        {!section.isCustom && (
          <button
            type="button"
            onClick={() => resetSection(section.id)}
            title="Reset section to its template"
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
          >
            <RotateCcw size={13} /> Reset
          </button>
        )}
        <button
          type="button"
          onClick={() => removeSection(section.id)}
          title="Move section to trash"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100 hover:text-red-600 dark:text-stone-400 dark:hover:bg-stone-800"
        >
          <Trash2 size={13} /> Delete
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        <CodeMirrorEditor
          key={`${section.id}:${isDark ? "dark" : "light"}:${epoch}`}
          initialDoc={section.markdown}
          isDark={isDark}
          onChange={(doc) => updateSection(section.id, doc)}
        />
      </div>
    </div>
  );
}
