import { toast } from "sonner";
import { sectionLabel } from "@/shared";
import { useDocStore } from "../store/useDocStore";

/** Deletes a section and offers a one-click Undo in a toast. */
export function useRemoveSection(): (id: string) => void {
  const removeSection = useDocStore((s) => s.removeSection);
  const undoRemove = useDocStore((s) => s.undoRemove);
  return (id) => {
    const section = useDocStore.getState().sections.find((s) => s.id === id);
    if (!section) return;
    removeSection(id);
    toast(`Deleted “${sectionLabel(section)}”.`, {
      action: { label: "Undo", onClick: () => undoRemove(id) },
    });
  };
}
