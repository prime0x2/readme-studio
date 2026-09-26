import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory localStorage shim so zustand/persist works deterministically
// under node (Node 24 has its own localStorage global; override it).
const memory = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
  key: (i: number) => [...memory.keys()][i] ?? null,
  get length() {
    return memory.size;
  },
} as Storage);

const { capTrash, lastSaveSucceeded, STORAGE_FAILED_EVENT, useDocStore } = await import(
  "../src/store/useDocStore"
);

function reset() {
  memory.clear();
  useDocStore.getState().resetDocument();
}

describe("useDocStore", () => {
  beforeEach(reset);

  it("starts with the Title and Description section selected", () => {
    const { sections, selectedId } = useDocStore.getState();
    expect(sections).toHaveLength(1);
    expect(sections[0]?.slug).toBe("title-and-description");
    expect(selectedId).toBe(sections[0]?.id);
  });

  it("imports a README, keeping the old sections restorable", () => {
    const before = useDocStore.getState().sections;
    const base = { raw: "https://raw.githubusercontent.com/o/r/main/README.md" };
    useDocStore.getState().importDocument(
      [
        { name: "Header", markdown: "# Tool" },
        { name: "Usage", markdown: "## Usage\n\nrun it" },
      ],
      base,
    );
    const state = useDocStore.getState();
    expect(state.sections.map((s) => s.name)).toEqual(["Header", "Usage"]);
    expect(state.sections.every((s) => s.isCustom)).toBe(true);
    expect(state.selectedId).toBe(state.sections[0]?.id);
    expect(state.trash.map((s) => s.id)).toEqual(before.map((s) => s.id));
    expect(state.documentBase).toEqual(base);
    // persisted, so the editor opened after navigation sees it
    expect(memory.get("readmestudio:doc:v1")).toContain("raw.githubusercontent.com");
  });

  it("caps deleted sections so imports can't fill storage", () => {
    const big = "x".repeat(400_000);
    for (let i = 0; i < 6; i++) {
      useDocStore.getState().importDocument([{ name: `Doc ${i}`, markdown: big }], null);
    }
    const { trash } = useDocStore.getState();
    const chars = trash.reduce((sum, s) => sum + s.markdown.length, 0);
    expect(chars).toBeLessThanOrEqual(1_500_000);
    expect(trash[0]?.name).toBe("Doc 4"); // newest kept first
    expect(
      capTrash(
        Array.from({ length: 80 }, (_, i) => ({
          id: `${i}`,
          slug: "custom",
          name: `${i}`,
          markdown: "x",
          isCustom: true,
        })),
      ),
    ).toHaveLength(50);
  });

  it("survives a full storage quota and reports it instead of throwing", () => {
    const failed = vi.fn();
    const target = new EventTarget();
    const globals = globalThis as { window?: unknown };
    const previousWindow = globals.window;
    globals.window = target; // only `window`: the localStorage shim must stay
    target.addEventListener(STORAGE_FAILED_EVENT, failed);
    const setItem = localStorage.setItem;
    localStorage.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
    try {
      expect(() =>
        useDocStore.getState().importDocument([{ name: "A", markdown: "a" }], null),
      ).not.toThrow();
      expect(lastSaveSucceeded()).toBe(false);
      expect(failed).toHaveBeenCalled();
    } finally {
      localStorage.setItem = setItem;
      globals.window = previousWindow;
    }
    useDocStore.getState().toggleSidebarCollapsed(); // next save works again
    expect(lastSaveSucceeded()).toBe(true);
  });

  it("toggles and persists the collapsed sidebar", () => {
    expect(useDocStore.getState().sidebarCollapsed).toBe(false);
    useDocStore.getState().toggleSidebarCollapsed();
    expect(useDocStore.getState().sidebarCollapsed).toBe(true);
    expect(memory.get("readmestudio:doc:v1")).toContain('"sidebarCollapsed":true');
  });

  it("defaults to the light theme and a balanced split", () => {
    expect(useDocStore.getState().uiTheme).toBe("light");
    expect(useDocStore.getState().previewRatio).toBe(0.5);
  });

  it("clamps the preview ratio to 25–75%", () => {
    useDocStore.getState().setPreviewRatio(0.95);
    expect(useDocStore.getState().previewRatio).toBe(0.75);
    useDocStore.getState().setPreviewRatio(0.05);
    expect(useDocStore.getState().previewRatio).toBe(0.25);
    useDocStore.getState().setPreviewRatio(0.6);
    expect(useDocStore.getState().previewRatio).toBe(0.6);
  });

  it("adds a template section and selects it", () => {
    useDocStore.getState().addSection("installation");
    const { sections, selectedId } = useDocStore.getState();
    expect(sections).toHaveLength(2);
    expect(sections[1]?.slug).toBe("installation");
    expect(selectedId).toBe(sections[1]?.id);
  });

  it("does not duplicate a template — selects the existing one instead", () => {
    useDocStore.getState().addSection("installation");
    const firstId = useDocStore.getState().selectedId;
    useDocStore.getState().selectSection(null);
    useDocStore.getState().addSection("installation");
    expect(useDocStore.getState().sections).toHaveLength(2);
    expect(useDocStore.getState().selectedId).toBe(firstId);
  });

  it("adds custom sections with a heading scaffold", () => {
    useDocStore.getState().addCustomSection("  Benchmarks  ");
    const section = useDocStore.getState().sections.at(-1);
    expect(section?.isCustom).toBe(true);
    expect(section?.name).toBe("Benchmarks");
    expect(section?.markdown).toContain("## Benchmarks");
  });

  it("updates section markdown", () => {
    const id = useDocStore.getState().sections[0]?.id ?? "";
    useDocStore.getState().updateSection(id, "# Changed");
    expect(useDocStore.getState().sections[0]?.markdown).toBe("# Changed");
  });

  it("moves removed sections to trash and restores them with content intact", () => {
    const id = useDocStore.getState().sections[0]?.id ?? "";
    useDocStore.getState().updateSection(id, "# Precious edits");
    useDocStore.getState().removeSection(id);
    expect(useDocStore.getState().sections).toHaveLength(0);
    expect(useDocStore.getState().trash).toHaveLength(1);

    useDocStore.getState().restoreSection(id);
    expect(useDocStore.getState().trash).toHaveLength(0);
    expect(useDocStore.getState().sections[0]?.markdown).toBe("# Precious edits");
    expect(useDocStore.getState().selectedId).toBe(id);
  });

  it("deletes forever from trash", () => {
    const id = useDocStore.getState().sections[0]?.id ?? "";
    useDocStore.getState().removeSection(id);
    useDocStore.getState().deleteForever(id);
    expect(useDocStore.getState().trash).toHaveLength(0);
  });

  it("resets a template section back to its template and bumps the epoch", () => {
    const id = useDocStore.getState().sections[0]?.id ?? "";
    const before = useDocStore.getState().epoch;
    useDocStore.getState().updateSection(id, "scribbles");
    useDocStore.getState().resetSection(id);
    expect(useDocStore.getState().sections[0]?.markdown).toContain("# Project Title");
    expect(useDocStore.getState().epoch).toBe(before + 1);
  });

  it("does not reset custom sections", () => {
    useDocStore.getState().addCustomSection("Mine");
    const id = useDocStore.getState().sections.at(-1)?.id ?? "";
    useDocStore.getState().updateSection(id, "custom content");
    useDocStore.getState().resetSection(id);
    expect(useDocStore.getState().sections.at(-1)?.markdown).toBe("custom content");
  });

  it("reorders sections by id", () => {
    useDocStore.getState().addSection("installation");
    useDocStore.getState().addSection("license");
    const [a, b, c] = useDocStore.getState().sections.map((s) => s.id);
    useDocStore.getState().reorderSections(c ?? "", a ?? "");
    expect(useDocStore.getState().sections.map((s) => s.id)).toEqual([c, a, b]);
  });

  it("persists state to storage and survives a rehydrate", async () => {
    useDocStore.getState().addSection("installation");
    const persisted = memory.get("readmestudio:doc:v1");
    expect(persisted).toBeTruthy();
    const parsed = JSON.parse(persisted ?? "{}");
    expect(parsed.state.sections).toHaveLength(2);
    expect(parsed.state.sections[1].slug).toBe("installation");
    // epoch is transient and must not be persisted
    expect(parsed.state.epoch).toBeUndefined();
  });

  it("resetDocument returns to a fresh single-section doc", () => {
    useDocStore.getState().addSection("installation");
    useDocStore.getState().addSection("license");
    useDocStore.getState().resetDocument();
    const { sections, trash } = useDocStore.getState();
    expect(sections).toHaveLength(1);
    expect(sections[0]?.slug).toBe("title-and-description");
    expect(trash).toHaveLength(0);
  });
});
