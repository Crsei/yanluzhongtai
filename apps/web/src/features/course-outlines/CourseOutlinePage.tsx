import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  ImportOutlined,
  LinkOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Empty,
  Popover,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { courseOutlinesApi } from "../../services/course-outlines";
import { AddOutlineItemModal } from "./AddOutlineItemModal";
import { EditOutlineItemModal } from "./EditOutlineItemModal";
import { ImportOverwriteDrawer } from "./ImportOverwriteDrawer";
import { OutlineVersionDropdown } from "./OutlineVersionDropdown";
import { confirmCreateVersion } from "./CreateVersionConfirm";
import { DeleteVersionConfirm } from "./DeleteVersionConfirm";
import { confirmDeleteItems } from "./DeleteItemsConfirm";
import { useOutline } from "./hooks/useOutline";
import { useOutlineVersions } from "./hooks/useOutlineVersions";
import { useOutlineMutations } from "./hooks/useOutlineMutations";
import type { CourseOutlineItem } from "./types";

export function CourseOutlinePage() {
  const [params, setParams] = useSearchParams();
  const versionsQ = useOutlineVersions();
  const role = useAuthStore((s) => s.user?.role);
  const canManage = role === "SUPER_ADMIN" || role === "ADMIN";

  const versions = versionsQ.data ?? [];
  const activeFromUrl = params.get("v");
  const activeVersionId =
    activeFromUrl && versions.some((v) => v.id === activeFromUrl)
      ? activeFromUrl
      : versions.find((v) => v.isActive)?.id ?? null;

  const outlineQ = useOutline(activeVersionId);
  const mutations = useOutlineMutations(activeVersionId);
  const activeVersion = versions.find((v) => v.id === activeVersionId) ?? null;

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<CourseOutlineItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteVersionOpen, setDeleteVersionOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!activeFromUrl && activeVersionId) {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("v", activeVersionId);
          return next;
        },
        { replace: true },
      );
    }
  }, [activeFromUrl, activeVersionId, setParams]);

  const sections = outlineQ.data?.sections ?? [];
  const items = outlineQ.data?.items ?? [];

  const itemsBySectionCode = useMemo(() => {
    const map = new Map<string, CourseOutlineItem[]>();
    for (const s of sections) map.set(s.code, []);
    for (const i of items) {
      const bucket = map.get(i.sectionCode);
      if (bucket) bucket.push(i);
      else map.set(i.sectionCode, [i]);
    }
    return map;
  }, [sections, items]);

  const selectedCount = selectedIds.length;
  const canEdit = selectedCount === 1;
  const canBatchDelete = selectedCount >= 1;

  const openEdit = () => {
    const target = items.find((i) => i.id === selectedIds[0]);
    if (!target) return;
    setEditItem(target);
    setEditOpen(true);
  };

  const openDelete = () => {
    const targets = items.filter((i) => selectedIds.includes(i.id));
    confirmDeleteItems(
      targets.map((t) => ({
        id: t.id,
        secondaryCategoryName: t.secondaryCategoryName ?? "",
      })),
      async () => {
        await mutations.deleteItems.mutateAsync(selectedIds);
        setSelectedIds([]);
      },
    );
  };

  const onCreateVersion = () => {
    confirmCreateVersion(async () => {
      try {
        const created = await mutations.createVersion.mutateAsync();
        setParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("v", created.id);
          return next;
        });
      } catch {
        // useOutlineMutations handles message.error
      }
    });
  };

  const renderActualTeachers = (list: CourseOutlineItem["actualTeachers"]) => {
    if (!list || list.length === 0) return <span>—</span>;
    const head = list.slice(0, 2);
    const rest = list.length - head.length;
    const chips = head.map((t) => <Tag key={t.jobNo}>{t.name}</Tag>);
    if (rest > 0) {
      return (
        <Popover
          content={
            <div style={{ maxWidth: 260 }}>
              {list.map((t) => (
                <div key={t.jobNo}>
                  {t.name} — {t.jobNo}({t.courseCount} 门)
                </div>
              ))}
            </div>
          }
        >
          <span>
            {chips}
            <Tag>+{rest} 人</Tag>
          </span>
        </Popover>
      );
    }
    return <span>{chips}</span>;
  };

  const columns = [
    { title: "序列号", dataIndex: "sequenceNo", key: "sequenceNo", width: 90 },
    {
      title: "二级课程类别名称",
      dataIndex: "secondaryCategoryName",
      key: "secondaryCategoryName",
    },
    {
      title: "建议授课方式",
      dataIndex: "suggestedTeachingType",
      key: "suggestedTeachingType",
      width: 140,
    },
    {
      title: "计划授课老师",
      key: "plannedTeacher",
      width: 160,
      render: (_: unknown, row: CourseOutlineItem) =>
        row.plannedTeacher ? (
          <span>
            {row.plannedTeacher.name}
            {row.plannedTeacher.employmentStatus === "RESIGNED" ? (
              <Tag color="red" style={{ marginLeft: 8 }}>
                已离职
              </Tag>
            ) : null}
          </span>
        ) : (
          <span>—</span>
        ),
    },
    {
      title: "实际授课老师(自动同步)",
      key: "actualTeachers",
      width: 240,
      render: (_: unknown, row: CourseOutlineItem) =>
        renderActualTeachers(row.actualTeachers),
    },
    {
      title: "教案排期",
      dataIndex: "lessonPlanUrl",
      key: "lessonPlanUrl",
      width: 200,
      render: (url: string | null) =>
        url ? (
          <a href={url} target="_blank" rel="noreferrer">
            打开
          </a>
        ) : (
          <span>—</span>
        ),
    },
  ];

  return (
    <div>
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        研录课程大纲
      </Typography.Title>

      <div className="course-outline-toolbar">
        <Space wrap>
          <OutlineVersionDropdown
            versions={versions}
            value={activeVersionId}
            loading={versionsQ.isLoading}
            onChange={(id) =>
              setParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set("v", id);
                return next;
              })
            }
          />
          {canManage ? (
            <>
              <Button icon={<EditOutlined />} disabled={!canEdit} onClick={openEdit}>
                编辑
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                disabled={!activeVersionId}
                onClick={() => setAddOpen(true)}
              >
                向大纲添加
              </Button>
              <Button
                danger
                icon={<DeleteOutlined />}
                disabled={!canBatchDelete}
                onClick={openDelete}
              >
                从大纲删除
              </Button>
            </>
          ) : null}
        </Space>
        <div style={{ flex: 1 }} />
        <Space wrap>
          {canManage ? (
            <>
              <Button onClick={onCreateVersion}>创建新大纲</Button>
              <Button
                icon={<ImportOutlined />}
                disabled={!activeVersionId}
                onClick={() => setImportOpen(true)}
              >
                导入并覆盖
              </Button>
              <Button
                danger
                disabled={!activeVersionId}
                onClick={() => setDeleteVersionOpen(true)}
              >
                删除当前大纲
              </Button>
            </>
          ) : null}
          <Button
            type="link"
            icon={<DownloadOutlined />}
            onClick={() =>
              courseOutlinesApi.downloadTemplate().catch(() => message.error("下载失败"))
            }
          >
            下载空白大纲模板
          </Button>
        </Space>
      </div>

      {!activeVersionId ? (
        <Empty
          description="暂无大纲版本,请点击“创建新大纲”开始"
          style={{ marginTop: 48 }}
        />
      ) : sections.length === 0 ? (
        <Empty
          description={`版本 ${activeVersion?.versionName ?? ""} 暂无板块,请点击“向大纲添加”开始创建`}
          style={{ marginTop: 48 }}
        />
      ) : (
        sections.map((section) => (
          <Card
            key={section.id}
            title={
              <Space size={8}>
                <span>{`${section.name} (${section.code})`}</span>
                {section.resourceUrl ? (
                  <Tooltip title="打开板块资源">
                    <Button
                      type="link"
                      size="small"
                      icon={<LinkOutlined />}
                      href={section.resourceUrl}
                      target="_blank"
                    />
                  </Tooltip>
                ) : null}
              </Space>
            }
            className="course-outline-section-card"
          >
            <Table<CourseOutlineItem>
              rowKey="id"
              size="middle"
              pagination={false}
              dataSource={itemsBySectionCode.get(section.code) ?? []}
              columns={columns}
              rowSelection={{
                selectedRowKeys: selectedIds,
                onChange: (keys) => setSelectedIds(keys as string[]),
                preserveSelectedRowKeys: true,
              }}
            />
          </Card>
        ))
      )}

      {activeVersionId ? (
        <>
          <AddOutlineItemModal
            open={addOpen}
            versionId={activeVersionId}
            sections={sections}
            onClose={() => setAddOpen(false)}
          />
          <EditOutlineItemModal
            open={editOpen}
            versionId={activeVersionId}
            sections={sections}
            item={editItem}
            onClose={() => {
              setEditOpen(false);
              setEditItem(null);
            }}
          />
          <ImportOverwriteDrawer
            open={importOpen}
            versionId={activeVersionId}
            versionName={activeVersion?.versionName ?? ""}
            onClose={() => setImportOpen(false)}
          />
          <DeleteVersionConfirm
            open={deleteVersionOpen}
            versionName={activeVersion?.versionName ?? ""}
            onClose={() => setDeleteVersionOpen(false)}
            loading={mutations.deleteVersion.isPending}
            onConfirm={async () => {
              await mutations.deleteVersion.mutateAsync({
                id: activeVersionId,
                confirmVersionName: activeVersion?.versionName ?? "",
              });
              setParams((prev) => {
                const next = new URLSearchParams(prev);
                next.delete("v");
                return next;
              });
            }}
          />
        </>
      ) : null}
    </div>
  );
}
