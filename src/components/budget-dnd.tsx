"use client";
import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Active,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type Over,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { appPath } from "@/infrastructure/app-path";

/**
 * Drag and drop on the Budget page, as in YNAB: groups reorder among
 * themselves, and a category moves within its group or into another one.
 * Rows and blocks stay server-rendered; this only adds handles, a drop line
 * and the command. Move up/Move down remain for anyone who prefers buttons.
 */

type Item =
  | { kind: "group"; id: string; name: string; system: boolean }
  | {
      kind: "category";
      id: string;
      name: string;
      groupId: string;
      /** A card's payment category: it only moves within its own group. */
      payment: boolean;
    };
type Drop = { id: string; position: "before" | "after" | "into" } | null;

const Board = createContext<{
  enabled: boolean;
  drop: Drop;
  saving: string | null;
}>({ enabled: false, drop: null, saving: null });
const Handle = createContext<{
  label: string;
  props: Record<string, unknown>;
  attach: (node: HTMLElement | null) => void;
} | null>(null);

const itemOf = (x: Active | Over | null) =>
  (x?.data.current as Item | undefined) ?? null;

// A category is only ever dropped on a category row, or on a group (its
// end); a group only on another group.
const collide: CollisionDetection = (args) => {
  const kind = itemOf(args.active)?.kind;
  const of = (k: Item["kind"]) =>
    args.droppableContainers.filter(
      (c) => (c.data.current as Item | undefined)?.kind === k,
    );
  if (kind === "category") {
    const rows = of("category");
    const onRow = pointerWithin({ ...args, droppableContainers: rows });
    if (onRow.length) return onRow;
    const onGroup = pointerWithin({ ...args, droppableContainers: of("group") });
    if (onGroup.length) return onGroup;
    return closestCenter({ ...args, droppableContainers: rows });
  }
  const groups = of("group");
  const hit = pointerWithin({ ...args, droppableContainers: groups });
  return hit.length ? hit : closestCenter({ ...args, droppableContainers: groups });
};

export function BudgetDnd({
  budgetId,
  enabled,
  groups,
  categories,
  children,
}: {
  budgetId: string;
  /** Off while a Focused View shows only part of the plan. */
  enabled: boolean;
  /** Every group on screen, in order. */
  groups: string[];
  /** Each group's categories on screen, in order. */
  categories: Record<string, string[]>;
  children: ReactNode;
}) {
  const router = useRouter();
  const [active, setActive] = useState<Item | null>(null);
  const [drop, setDrop] = useState<Drop>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const dropRef = useRef<Drop>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const place = (event: DragMoveEvent): Drop => {
    const dragged = itemOf(event.active);
    const target = itemOf(event.over);
    const rect = event.active.rect.current.translated;
    if (!dragged || !target || !event.over || !rect) return null;
    if (target.id === dragged.id) return null;
    if (dragged.kind === "group") {
      if (target.kind !== "group" || target.system) return null;
    } else if (target.kind === "group") {
      // Onto a group: its end. Card payments stay in their own group, and
      // nothing else goes into it.
      if (dragged.payment ? target.id !== dragged.groupId : target.system)
        return null;
      return { id: target.id, position: "into" };
    } else if (
      target.kind === "category" &&
      (dragged.payment
        ? target.groupId !== dragged.groupId
        : target.payment)
    )
      return null;
    const middle = rect.top + rect.height / 2;
    const over = event.over.rect;
    return {
      id: target.id,
      position: middle < over.top + over.height / 2 ? "before" : "after",
    };
  };

  const track = (event: DragMoveEvent) => {
    const next = place(event);
    const now = dropRef.current;
    if (next?.id === now?.id && next?.position === now?.position) return;
    dropRef.current = next;
    setDrop(next);
  };

  const finish = async (event: DragEndEvent) => {
    const dragged = itemOf(event.active);
    const target = dropRef.current;
    setActive(null);
    setDrop(null);
    dropRef.current = null;
    if (!dragged || !target) return;
    let command: Record<string, unknown> | null = null;
    if (dragged.kind === "group") {
      const rest = groups.filter((id) => id !== dragged.id);
      const at = rest.indexOf(target.id) + (target.position === "after" ? 1 : 0);
      const beforeId = rest[at] ?? null;
      if (groups[groups.indexOf(dragged.id) + 1] !== (beforeId ?? undefined))
        command = { type: "group.move", id: dragged.id, beforeId };
    } else {
      const groupId =
        target.position === "into"
          ? target.id
          : (Object.keys(categories).find((g) =>
              categories[g].includes(target.id),
            ) ?? null);
      if (!groupId) return;
      const list = categories[groupId] ?? [];
      const rest = list.filter((id) => id !== dragged.id);
      const beforeId =
        target.position === "into"
          ? null
          : (rest[
              rest.indexOf(target.id) + (target.position === "after" ? 1 : 0)
            ] ?? null);
      const unchanged =
        groupId === dragged.groupId &&
        list[list.indexOf(dragged.id) + 1] === (beforeId ?? undefined);
      if (!unchanged)
        command = { type: "category.move", id: dragged.id, groupId, beforeId };
    }
    if (!command) return;
    setSaving(dragged.id);
    setError("");
    try {
      const response = await fetch(appPath("/api/finance"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budgetId, key: crypto.randomUUID(), command }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to move it.");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "No connection. Nothing was moved."
          : e instanceof Error
            ? e.message
            : "Unable to move it.",
      );
    } finally {
      setSaving(null);
    }
  };

  const board = useMemo(
    () => ({ enabled, drop, saving }),
    [enabled, drop, saving],
  );
  const named = (x: Active | Over | null) => itemOf(x)?.name ?? "";
  return (
    <Board.Provider value={board}>
      <DndContext
        id="budget-dnd"
        sensors={sensors}
        collisionDetection={collide}
        onDragStart={(e) => {
          setActive(itemOf(e.active));
          setError("");
        }}
        onDragMove={track}
        onDragOver={track}
        onDragCancel={() => {
          setActive(null);
          setDrop(null);
          dropRef.current = null;
        }}
        onDragEnd={finish}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "To move, press space or enter, use the arrow keys, then press space or enter to drop, or escape to cancel.",
          },
          announcements: {
            onDragStart: ({ active }) => `Picked up ${named(active)}.`,
            onDragOver: ({ active, over }) =>
              over
                ? `${named(active)} is over ${named(over)}.`
                : `${named(active)} is not over a place it can go.`,
            onDragEnd: ({ active, over }) =>
              over
                ? `${named(active)} dropped at ${named(over)}.`
                : `${named(active)} was not moved.`,
            onDragCancel: ({ active }) => `${named(active)} was not moved.`,
          },
        }}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {active ? (
            <div className="drag-overlay">
              <GripVertical aria-hidden size={14} />
              {active.name}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <p
        role={error ? "alert" : undefined}
        className="form-message error px-4 lg:px-6"
      >
        {error}
      </p>
    </Board.Provider>
  );
}

function useItem(item: Item, draggable: boolean) {
  const { enabled, drop, saving } = useContext(Board);
  const on = enabled && draggable;
  const drag = useDraggable({ id: `${item.kind}:${item.id}`, data: item, disabled: !on });
  const target = useDroppable({ id: `${item.kind}:${item.id}`, data: item, disabled: !enabled });
  const setRef = (node: HTMLElement | null) => {
    drag.setNodeRef(node);
    target.setNodeRef(node);
  };
  const handle = on
    ? {
        label: `Reorder ${item.name}`,
        props: { ...drag.attributes, ...drag.listeners },
        attach: drag.setActivatorNodeRef,
      }
    : null;
  const state = {
    "data-drop": drop?.id === item.id ? drop.position : undefined,
    "data-dragging": drag.isDragging || saving === item.id ? "" : undefined,
  };
  return { setRef, handle, state };
}

/** One group's block, draggable by the handle in its header. */
export function DndGroup({
  groupId,
  name,
  system,
  ...rest
}: { groupId: string; name: string; system: boolean } & ComponentProps<"div">) {
  const { setRef, handle, state } = useItem(
    { kind: "group", id: groupId, name, system },
    !system,
  );
  return (
    <Handle.Provider value={handle}>
      <div ref={setRef} {...rest} {...state} />
    </Handle.Provider>
  );
}

/** One category row, draggable by the handle in its name cell. */
export function DndRow({
  categoryId,
  name,
  groupId,
  payment,
  movable,
  ...rest
}: {
  categoryId: string;
  name: string;
  groupId: string;
  payment: boolean;
  movable: boolean;
} & ComponentProps<"tr">) {
  const { setRef, handle, state } = useItem(
    { kind: "category", id: categoryId, name, groupId, payment },
    movable,
  );
  return (
    <Handle.Provider value={handle}>
      <tr ref={setRef} {...rest} {...state} />
    </Handle.Provider>
  );
}

/** The grip for the nearest group or row; nothing when it cannot move. */
export function DragHandle() {
  const handle = useContext(Handle);
  if (!handle) return null;
  const { attach, props, label } = handle;
  return (
    <button
      type="button"
      ref={attach}
      className="drag-handle"
      {...props}
      aria-label={label}
    >
      <GripVertical aria-hidden size={14} />
    </button>
  );
}
