import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_SECTION_SLUG,
  type DocumentBase,
  getTemplate,
  type Section,
  type SplitSection,
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
  const first = sectionFromTemplate(DEFAULT_SECTION_SLUG);
  return {
    sections: first ? [first] : [],
    trash: [],
    selectedId: first?.id ?? null,
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
          sections: [...state.sections, section],
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
          sections: [...state.sections, section],
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
          const section = state.sections.find((s) => s.id === id);
          if (!section) return state;
          const sections = state.sections.filter((s) => s.id !== id);
          const selectedId = state.selectedId === id ? (sections[0]?.id ?? null) : state.selectedId;
          return { sections, trash: capTrash([section, ...state.trash]), selectedId };
        });
      },

      restoreSection: (id) => {
        set((state) => {
          const section = state.trash.find((s) => s.id === id);
          if (!section) return state;
          return {
            trash: state.trash.filter((s) => s.id !== id),
            sections: [...state.sections, section],
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

      resetDocument: () => set(initialState()),

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
        set((state) => ({
          sections,
          trash: capTrash([...state.sections, ...state.trash]),
          selectedId: sections[0]?.id ?? null,
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
