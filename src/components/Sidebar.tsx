import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArchiveRestore, GripVertical, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { sectionTemplates } from "@/shared";
import { useDocStore } from "../store/useDocStore";

function SortableSectionRow({ id }: { id: string }) {
  const section = useDocStore((s) => s.sections.find((x) => x.id === id));
  const selectedId = useDocStore((s) => s.selectedId);
  const selectSection = useDocStore((s) => s.selectSection);
  const removeSection = useDocStore((s) => s.removeSection);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  if (!section) return null;
  const selected = selectedId === id;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex items-center gap-1 rounded-lg border px-2 py-2 text-sm transition-colors ${
        isDragging ? "z-10 shadow-lg" : ""
      } ${
        selected
          ? "border-accent-400 bg-accent-50 text-accent-950 dark:border-accent-600 dark:bg-accent-950/60 dark:text-accent-100"
          : "border-transparent bg-white text-stone-700 hover:border-stone-200 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-stone-700"
      }`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-stone-400 hover:text-stone-600 active:cursor-grabbing dark:text-stone-600 dark:hover:text-stone-400"
        aria-label={`Reorder ${section.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={15} />
      </button>
      <button
        type="button"
        onClick={() => selectSection(id)}
        className="min-w-0 flex-1 truncate text-left font-medium"
      >
        {section.name}
      </button>
      <button
        type="button"
        onClick={() => removeSection(id)}
        aria-label={`Delete ${section.name}`}
        className="rounded p-1 text-stone-400 opacity-0 transition-opacity hover:bg-stone-100 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-stone-800"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const sections = useDocStore((s) => s.sections);
  const trash = useDocStore((s) => s.trash);
  const addSection = useDocStore((s) => s.addSection);
  const addCustomSection = useDocStore((s) => s.addCustomSection);
  const restoreSection = useDocStore((s) => s.restoreSection);
  const deleteForever = useDocStore((s) => s.deleteForever);
  const reorderSections = useDocStore((s) => s.reorderSections);

  const [query, setQuery] = useState("");
  const [trashOpen, setTrashOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const usedSlugs = useMemo(
    () => new Set(sections.filter((s) => !s.isCustom).map((s) => s.slug)),
    [sections],
  );

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sectionTemplates.filter(
      (t) => !usedSlugs.has(t.slug) && (q.length === 0 || t.name.toLowerCase().includes(q)),
    );
  }, [query, usedSlugs]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderSections(String(active.id), String(over.id));
    }
  }

  function submitCustom() {
    if (customName.trim()) {
      addCustomSection(customName);
      setCustomName("");
      setAddingCustom(false);
      onNavigate?.();
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {/* Your document */}
      <div>
        <h2 className="mb-2 font-mono text-[11px] font-medium tracking-[0.14em] text-stone-500 uppercase dark:text-stone-400">
          Your sections
        </h2>
        {sections.length === 0 ? (
          <p className="rounded-lg border border-dashed border-stone-300 px-3 py-4 text-center text-xs text-stone-500 dark:border-stone-700 dark:text-stone-400">
            No sections yet — add one below.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-1">
                {sections.map((s) => (
                  <SortableSectionRow key={s.id} id={s.id} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Template library — keeps its natural height; the column scrolls */}
      <div className="shrink-0">
        <h2 className="mb-2 font-mono text-[11px] font-medium tracking-[0.14em] text-stone-500 uppercase dark:text-stone-400">
          Add a section
        </h2>
        <div className="relative mb-2">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sections…"
            className="w-full rounded-lg border border-stone-200 bg-white py-1.5 pr-2 pl-8 text-sm text-stone-800 placeholder:text-stone-400 focus:border-accent-400 focus:ring-2 focus:ring-accent-200 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:focus:ring-accent-900"
          />
        </div>

        {addingCustom ? (
          <div className="mb-1 flex items-center gap-1">
            <input
              // biome-ignore lint/a11y/noAutofocus: the input only appears on explicit user action
              autoFocus
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCustom();
                if (e.key === "Escape") setAddingCustom(false);
              }}
              placeholder="Custom section name…"
              className="w-full rounded-lg border border-accent-300 bg-white px-2 py-1.5 text-sm focus:ring-2 focus:ring-accent-200 focus:outline-none dark:border-accent-700 dark:bg-stone-900"
            />
            <button
              type="button"
              onClick={submitCustom}
              className="rounded-lg bg-accent-600 p-1.5 text-white hover:bg-accent-700"
              aria-label="Add custom section"
            >
              <Plus size={15} />
            </button>
            <button
              type="button"
              onClick={() => setAddingCustom(false)}
              className="rounded-lg p-1.5 text-stone-400 hover:text-stone-600"
              aria-label="Cancel"
            >
              <X size={15} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingCustom(true)}
            className="mb-1 flex w-full items-center gap-2 rounded-lg border border-dashed border-accent-300 px-3 py-2 text-sm font-medium text-accent-700 hover:bg-accent-50 dark:border-accent-800 dark:text-accent-300 dark:hover:bg-accent-950/40"
          >
            <Plus size={15} /> Custom section
          </button>
        )}

        <div className="flex flex-col gap-1">
          {available.map((t) => (
            <button
              key={t.slug}
              type="button"
              onClick={() => {
                addSection(t.slug);
                onNavigate?.();
              }}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
            >
              <span>{t.name}</span>
              <Plus size={14} className="text-stone-400" />
            </button>
          ))}
          {available.length === 0 && (
            <p className="px-3 py-2 text-xs text-stone-400">No matching sections.</p>
          )}
        </div>
      </div>

      {/* Trash */}
      {trash.length > 0 && (
        <div className="mt-auto shrink-0 border-t border-stone-200 pt-3 dark:border-stone-800">
          <button
            type="button"
            onClick={() => setTrashOpen((open) => !open)}
            className="flex w-full items-center justify-between font-mono text-[11px] font-medium tracking-[0.14em] text-stone-500 uppercase hover:text-stone-700 dark:text-stone-400"
          >
            <span>Deleted sections ({trash.length})</span>
            <span>{trashOpen ? "−" : "+"}</span>
          </button>
          {trashOpen && (
            <div className="mt-2 flex flex-col gap-1">
              {trash.map((s) => (
                <div
                  key={s.id}
                  className="group flex items-center gap-1 rounded-lg border border-dashed border-stone-300 px-2 py-1.5 text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400"
                >
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <button
                    type="button"
                    onClick={() => restoreSection(s.id)}
                    aria-label={`Restore ${s.name}`}
                    className="rounded p-1 text-stone-400 hover:text-accent-600"
                    title="Restore"
                  >
                    <ArchiveRestore size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteForever(s.id)}
                    aria-label={`Delete ${s.name} forever`}
                    className="rounded p-1 text-stone-400 hover:text-red-600"
                    title="Delete forever"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
