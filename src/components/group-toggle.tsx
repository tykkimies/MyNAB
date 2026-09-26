"use client";
import { useEffect, useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";

const KEY = "mynab-collapsed-groups";
const EVENT = "mynab-collapsed-groups";

/** The stored list as one string, so identical reads are the same snapshot. */
const snapshot = () => {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
};
const parse = (raw: string): string[] => {
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const subscribe = (onChange: () => void) => {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
};
const write = (list: string[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Private mode or storage disabled: the choice lasts until reload.
  }
  window.dispatchEvent(new Event(EVENT));
};

/**
 * Folds a ledger group down to its bar. The choice is per browser and
 * survives reloads; the server always renders groups open, and a folded
 * group closes as soon as the browser's stored list is read.
 */
export function GroupToggle({ id, name }: { id: string; name: string }) {
  const stored = useSyncExternalStore(subscribe, snapshot, () => "[]");
  const open = !parse(stored).includes(id);
  useEffect(() => {
    const block = document.getElementById(`group-${id}`);
    if (!block) return;
    if (open) block.removeAttribute("data-collapsed");
    else block.setAttribute("data-collapsed", "");
  }, [open, id]);
  return (
    <button
      type="button"
      className="icon-button -ml-1.5 h-6 w-6 shrink-0"
      aria-expanded={open}
      aria-label={`${open ? "Collapse" : "Expand"} ${name}`}
      onClick={() => {
        const list = parse(snapshot()).filter((x) => x !== id);
        write(open ? [...list, id] : list);
      }}
    >
      <ChevronDown
        size={14}
        aria-hidden
        className={`transition-transform ${open ? "" : "-rotate-90"}`}
      />
    </button>
  );
}
