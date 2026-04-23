import { HolderOutlined } from "@ant-design/icons";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Modal } from "antd";
import { useEffect, useState } from "react";
import { useQuickLinkMutations } from "./hooks/useQuickLinkMutations";
import type { QuickLinkGroup, QuickLinkPageType, QuickLinkRow } from "./types";

type Props = {
  open: boolean;
  pageType: QuickLinkPageType;
  groups: QuickLinkGroup[];
  onClose: () => void;
};

type OrderedRow = Pick<QuickLinkRow, "id" | "title" | "category">;

function SortableItem({ row }: { row: OrderedRow }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: row.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style} className="quick-link-sort-row">
      <span {...attributes} {...listeners} className="quick-link-sort-handle">
        <HolderOutlined />
      </span>
      <span className="quick-link-sort-title">{row.title}</span>
    </div>
  );
}

export function QuickLinkSortModal({ open, pageType, groups, onClose }: Props) {
  const { reorder } = useQuickLinkMutations();
  const [ordered, setOrdered] = useState<Record<string, OrderedRow[]>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<string, OrderedRow[]> = {};
    for (const group of groups) {
      next[group.category] = group.items.map((item) => ({
        id: item.id,
        title: item.title,
        category: item.category,
      }));
    }
    setOrdered(next);
  }, [open, groups]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragEnd(category: string) {
    return (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setOrdered((prev) => {
        const list = prev[category] ?? [];
        const oldIndex = list.findIndex((r) => r.id === active.id);
        const newIndex = list.findIndex((r) => r.id === over.id);
        return { ...prev, [category]: arrayMove(list, oldIndex, newIndex) };
      });
    };
  }

  const handleOk = async () => {
    const items: Array<{ id: string; sortOrder: number }> = [];
    for (const category of Object.keys(ordered)) {
      ordered[category].forEach((row, idx) => {
        items.push({ id: row.id, sortOrder: (idx + 1) * 10 });
      });
    }
    if (items.length === 0) {
      onClose();
      return;
    }
    await reorder.mutateAsync({ pageType, items });
    onClose();
  };

  return (
    <Modal
      open={open}
      title="调整排序"
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={reorder.isPending}
      okText="保存"
      cancelText="取消"
      width={520}
      destroyOnClose
    >
      {Object.entries(ordered).map(([category, rows]) => (
        <div key={category} className="quick-link-sort-group">
          <div className="quick-link-sort-group-title">{category}</div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd(category)}
          >
            <SortableContext
              items={rows.map((r) => r.id)}
              strategy={verticalListSortingStrategy}
            >
              {rows.map((row) => (
                <SortableItem key={row.id} row={row} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      ))}
    </Modal>
  );
}
