import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  type DocumentBase,
  getTemplate,
  type Section,
  type SplitSection,
  UNTITLED_SECTION_NAME,
} from "@/shared";

export type UiTheme = "light" | "dark" | "system";

interface DocState {
  sections: Section[];
  trash: Section[];
  selectedId: string | null;
  uiTheme: UiTheme;
  /** Preview pane share of the editor+preview area (desktop), 0.25–0.75. */
  previewRatio: number;
  /** Desktop: sections sidebar hidden to give the editor/preview more room. */
  sidebarCollapsed: boolean;
  /**
   * Where an imported README lives on GitHub, so its relative image and
   * link paths keep resolving in the preview and exports. The markdown
   * itself keeps the relative paths, as it will in the repository.
   */
  documentBase: DocumentBase | null;
  /** Bumped when section content changes outside the editor (reset). */
  epoch: number;
}

interface DocActions {
  addSection: (slug: string) => void;
  addCustomSection: (name: string) => void;
  updateSection: (id: string, markdown: string) => void;
  removeSection: (id: string) => void;
  /** Put a just-removed section back where it was. */
  undoRemove: (id: string) => void;
  restoreSection: (id: string) => void;
  deleteForever: (id: string) => void;
  resetSection: (id: string) => void;
  reorderSections: (fromId: string, toId: string) => void;
  selectSection: (id: string | null) => void;
  resetDocument: () => void;
  setUiTheme: (theme: UiTheme) => void;
  setPreviewRatio: (ratio: number) => void;
  toggleSidebarCollapsed: () => void;
  /** Replace the document; the current sections move to the trash. */
  importDocument: (sections: SplitSection[], base: DocumentBase | null) => void;
}

export type DocStore = DocState & DocActions;

function sectionFromTemplate(slug: string): Section | null {
  const template = getTemplate(slug);
  if (!template) return null;
  return {
    id: crypto.randomUUID(),
    slug: template.slug,
    name: template.name,
    markdown: template.markdown,
    isCustom: false,
  };
}

/** The empty section a fresh document starts with; it names itself from its first heading. */
function blankSection(): Section {
  return {
    id: crypto.randomUUID(),
    slug: "custom",
    name: UNTITLED_SECTION_NAME,
    markdown: "",
    isCustom: true,
    autoName: true,
  };
}

const isUntouchedBlank = (section: Section) =>
  section.autoName === true && section.markdown.trim() === "";

/** Adding to a document that's just one untouched blank section replaces that section. */
function withAdded(sections: Section[], section: Section): Section[] {
  const [only] = sections;
  const kept = sections.length === 1 && only && isUntouchedBlank(only) ? [] : sections;
  return [...kept, section];
}

/** The document always has a section to type into, and a valid selection. */
function withSections<T extends Pick<DocState, "sections" | "selectedId">>(state: T): T {
  if (state.sections.length === 0) {
    const blank = blankSection();
    return { ...state, sections: [blank], selectedId: blank.id };
  }
  if (!state.sections.some((s) => s.id === state.selectedId)) {
    return { ...state, selectedId: state.sections[0]?.id ?? null };
  }
  return state;
}

/** Recent deletions, for Undo. In memory only: Undo lasts as long as its toast. */
const removals = new Map<
  string,
  { section: Section; index: number; placeholderId: string | null }
>();

/*
 * Deleted sections are kept for restoring, newest first. Imports move a
 * whole README into the trash, so without a cap a few large imports fill
 * the ~5 MB localStorage quota and every later save fails.
 */
const TRASH_MAX_ITEMS = 50;
const TRASH_MAX_CHARS = 1_500_000;

export function capTrash(trash: Section[]): Section[] {
  let chars = 0;
  const kept: Section[] = [];
  for (const section of trash) {
    chars += section.markdown.length;
    if (kept.length >= TRASH_MAX_ITEMS || (kept.length > 0 && chars > TRASH_MAX_CHARS)) break;
    kept.push(section);
  }
  return kept;
}

/** Fired on window when saving the document to localStorage fails. */
export const STORAGE_FAILED_EVENT = "readmestudio:storage-failed";

let lastSaveOk = true;
/** Whether the most recent save reached localStorage. */
export function lastSaveSucceeded(): boolean {
  return lastSaveOk;
}

/**
 * localStorage that never throws: a full quota or blocked storage would
 * otherwise throw out of every state update (zustand persists inside
 * `set`). Failures are reported through STORAGE_FAILED_EVENT instead.
 */
const guardedStorage: Storage = {
  get length() {
    try {
      return localStorage.length;
    } catch {
      return 0;
    }
  },
  key: (index) => {
    try {
      return localStorage.key(index);
    } catch {
      return null;
    }
  },
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
      lastSaveOk = true;
    } catch {
      lastSaveOk = false;
      if (typeof window !== "undefined") window.dispatchEvent(new Event(STORAGE_FAILED_EVENT));
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // nothing to do
    }
  },
  clear: () => {
    try {
      localStorage.clear();
    } catch {
      // nothing to do
    }
  },
};

function initialState(): DocState {
  const first = blankSection();
  return {
    sections: [first],
    trash: [],
    selectedId: first.id,
    uiTheme: "light",
    previewRatio: 0.5,
    sidebarCollapsed: false,
    documentBase: null,
    epoch: 0,
  };
}

export const useDocStore = create<DocStore>()(
  persist(
    (set, get) => ({
      ...initialState(),

      addSection: (slug) => {
        const existing = get().sections.find((s) => s.slug === slug && !s.isCustom);
        if (existing) {
          // Already in the document — select it instead of duplicating.
          set({ selectedId: existing.id });
          return;
        }
        const section = sectionFromTemplate(slug);
        if (!section) return;
        set((state) => ({
          sections: withAdded(state.sections, section),
          selectedId: section.id,
        }));
      },

      addCustomSection: (name) => {
        const trimmed = name.trim();
        if (trimmed.length === 0) return;
        const section: Section = {
          id: crypto.randomUUID(),
          slug: "custom",
          name: trimmed,
          markdown: `## ${trimmed}\n\nWrite something here.\n`,
          isCustom: true,
        };
        set((state) => ({
          sections: withAdded(state.sections, section),
          selectedId: section.id,
        }));
      },

      updateSection: (id, markdown) => {
        set((state) => ({
          sections: state.sections.map((s) => (s.id === id ? { ...s, markdown } : s)),
        }));
      },

      removeSection: (id) => {
        set((state) => {
          const index = state.sections.findIndex((s) => s.id === id);
          const section = state.sections[index];
          if (!section) return state;
          let sections = state.sections.filter((s) => s.id !== id);
          let placeholderId: string | null = null;
          if (sections.length === 0) {
            // Never leave the editor with nothing to type into.
            const blank = blankSection();
            sections = [blank];
            placeholderId = blank.id;
          }
          removals.set(id, { section, index, placeholderId });
          const selectedId =
            state.selectedId === id
              ? (sections[Math.min(index, sections.length - 1)]?.id ?? null)
              : state.selectedId;
          // An empty section isn't worth keeping in Deleted sections.
          const trash = isUntouchedBlank(section)
            ? state.trash
            : capTrash([section, ...state.trash]);
          return { sections, trash, selectedId };
        });
      },

      undoRemove: (id) => {
        const removal = removals.get(id);
        if (!removal) return;
        removals.delete(id);
        set((state) => {
          if (state.sections.some((s) => s.id === id)) return state; // restored already
          const sections = state.sections.filter(
            (s) => !(s.id === removal.placeholderId && isUntouchedBlank(s)),
          );
          const at = Math.min(removal.index, sections.length);
          sections.splice(at, 0, removal.section);
          return {
            sections,
            trash: state.trash.filter((s) => s.id !== id),
            selectedId: id,
          };
        });
      },

      restoreSection: (id) => {
        set((state) => {
          const section = state.trash.find((s) => s.id === id);
          if (!section) return state;
          return {
            trash: state.trash.filter((s) => s.id !== id),
            sections: withAdded(state.sections, section),
            selectedId: section.id,
          };
        });
      },

      deleteForever: (id) => {
        set((state) => ({ trash: state.trash.filter((s) => s.id !== id) }));
      },

      resetSection: (id) => {
        set((state) => ({
          epoch: state.epoch + 1,
          sections: state.sections.map((s) => {
            if (s.id !== id || s.isCustom) return s;
            const template = getTemplate(s.slug);
            return template ? { ...s, markdown: template.markdown } : s;
          }),
        }));
      },

      reorderSections: (fromId, toId) => {
        set((state) => {
          const from = state.sections.findIndex((s) => s.id === fromId);
          const to = state.sections.findIndex((s) => s.id === toId);
          if (from < 0 || to < 0 || from === to) return state;
          const sections = [...state.sections];
          const moved = sections.splice(from, 1)[0];
          if (!moved) return state;
          sections.splice(to, 0, moved);
          return { sections };
        });
      },

      selectSection: (id) => set({ selectedId: id }),

      resetDocument: () => {
        removals.clear();
        set(initialState());
      },

      setUiTheme: (uiTheme) => set({ uiTheme }),

      setPreviewRatio: (ratio) => set({ previewRatio: Math.min(0.75, Math.max(0.25, ratio)) }),

      toggleSidebarCollapsed: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      importDocument: (imported, base) => {
        const sections: Section[] = imported.map((section) => ({
          id: crypto.randomUUID(),
          slug: "custom",
          name: section.name,
          markdown: section.markdown,
          isCustom: true,
        }));
        removals.clear();
        set((state) => ({
          ...withSections({ sections, selectedId: sections[0]?.id ?? null }),
          trash: capTrash([...state.sections.filter((s) => !isUntouchedBlank(s)), ...state.trash]),
          documentBase: base,
          epoch: state.epoch + 1,
        }));
      },
    }),
    {
      name: "readmestudio:doc:v1",
      version: 2,
      storage: createJSONStorage(() => guardedStorage),
      partialize: (state) => ({
        sections: state.sections,
        trash: state.trash,
        selectedId: state.selectedId,
        uiTheme: state.uiTheme,
        previewRatio: state.previewRatio,
        sidebarCollapsed: state.sidebarCollapsed,
        documentBase: state.documentBase,
      }),
      // Saved documents from before "never empty" may have no sections left.
      merge: (persisted, current) =>
        withSections({ ...current, ...(persisted as Partial<DocState>) }),
      migrate: (persisted, version) => {
        const state = persisted as Partial<DocState>;
        if (version < 2) {
          // v1 defaulted to the OS theme; the default is now plain light.
          return { ...state, uiTheme: "light" as const };
        }
        return state;
      },
    },
  ),
);
