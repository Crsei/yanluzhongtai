import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SortAscendingOutlined,
} from "@ant-design/icons";
import { Button, Empty, Skeleton, Space, Typography } from "antd";
import { useMemo, useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import { useQueryClient } from "@tanstack/react-query";
import { QuickLinkCard } from "./QuickLinkCard";
import { QuickLinkFormModal } from "./QuickLinkFormModal";
import { QuickLinkSortModal } from "./QuickLinkSortModal";
import { confirmDeleteQuickLinks } from "./QuickLinkDeleteConfirm";
import { useQuickLinks } from "./hooks/useQuickLinks";
import type { QuickLinkPageType, QuickLinkRow } from "./types";

type Props = {
  pageType: QuickLinkPageType;
  title: string;
  accent: "blue" | "green";
};

export function QuickLinkCenterPage({ pageType, title, accent }: Props) {
  const user = useAuthStore((state) => state.user);
  const canManage = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";
  const qc = useQueryClient();
  const { data, isLoading } = useQuickLinks(pageType);
  const [selected, setSelected] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState<false | "create" | "edit">(false);
  const [sortOpen, setSortOpen] = useState(false);

  const groups = data?.groups ?? [];
  const allItems: QuickLinkRow[] = useMemo(
    () => groups.flatMap((g) => g.items),
    [groups],
  );
  const knownCategories = useMemo(
    () => Array.from(new Set(groups.map((g) => g.category))),
    [groups],
  );
  const selectedRow = selected.length === 1
    ? allItems.find((item) => item.id === selected[0]) ?? null
    : null;

  const toggleSelect = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const onDelete = () => {
    if (selected.length === 0) return;
    confirmDeleteQuickLinks(selected, () => {
      setSelected([]);
      void qc.invalidateQueries({ queryKey: ["quick-links"] });
    });
  };

  return (
    <div className={`quick-link-center quick-link-center-${accent}`}>
      <div className="quick-link-center-header">
        <Typography.Title level={2} className="quick-link-center-title">
          {title}
        </Typography.Title>
        {canManage ? (
          <Space>
            <Button
              icon={<SortAscendingOutlined />}
              onClick={() => setSortOpen(true)}
            >
              排序
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setFormOpen("create")}
            >
              添加
            </Button>
            <Button
              icon={<EditOutlined />}
              disabled={selected.length !== 1}
              onClick={() => setFormOpen("edit")}
            >
              编辑
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={selected.length === 0}
              onClick={onDelete}
            >
              删除
            </Button>
          </Space>
        ) : null}
      </div>

      {isLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : groups.length === 0 ? (
        <Empty
          description={
            canManage
              ? "暂无快捷入口，点击右上角「添加」录入。"
              : "暂无快捷入口。"
          }
        />
      ) : (
        groups.map((group) => (
          <section key={group.category} className="quick-link-group">
            <h3 className="quick-link-group-title">{group.category}</h3>
            <div className="quick-link-grid">
              {group.items.map((item) => (
                <QuickLinkCard
                  key={item.id}
                  link={item}
                  accent={accent}
                  selected={selected.includes(item.id)}
                  onToggleSelect={toggleSelect}
                  showSelector={canManage}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {formOpen === "create" ? (
        <QuickLinkFormModal
          open
          mode="create"
          pageType={pageType}
          knownCategories={knownCategories}
          onClose={() => setFormOpen(false)}
        />
      ) : null}

      {formOpen === "edit" && selectedRow ? (
        <QuickLinkFormModal
          open
          mode="edit"
          initial={selectedRow}
          knownCategories={knownCategories}
          onClose={() => {
            setFormOpen(false);
            setSelected([]);
          }}
        />
      ) : null}

      <QuickLinkSortModal
        open={sortOpen}
        pageType={pageType}
        groups={groups}
        onClose={() => setSortOpen(false)}
      />
    </div>
  );
}
