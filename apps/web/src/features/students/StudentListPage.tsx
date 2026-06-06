// apps/web/src/features/students/StudentListPage.tsx
import { ExportOutlined } from "@ant-design/icons";
import { Button, Input, Space, Table, Tag, Typography, message } from "antd";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  SERVICE_STATUS_COLORS,
  SERVICE_STATUS_LABELS,
  type ServiceStatus,
} from "../../constants/dictionaries";
import { useAuthStore } from "../../stores/authStore";
import type { StudentDetail, StudentListItem } from "../../services/students";
import { studentsApi } from "../../services/students";
import { ActiveFilterTags } from "./ActiveFilterTags";
import { AdvancedSearchDrawer } from "./AdvancedSearchDrawer";
import { openStudentDeleteConfirm } from "./StudentDeleteConfirm";
import { StudentFormModal, type StudentFormMode } from "./StudentFormModal";
import { StudentImportDrawer } from "./StudentImportDrawer";
import { useStudents } from "./hooks/useStudents";
import { useStudentMutations } from "./hooks/useStudentMutations";

const PAGE_SIZE = 50;

export function StudentListPage() {
  const [params, setParams] = useSearchParams();
  const keyword = params.get("keyword") ?? "";
  const page = Number(params.get("page") ?? "1");

  const queryParams = useMemo(
    () => ({
      keyword: keyword || undefined,
      studentNo: params.get("studentNo") ?? undefined,
      name: params.get("name") ?? undefined,
      grade: params.get("grade") ?? undefined,
      major: params.get("major") ?? undefined,
      source: params.get("source") ?? undefined,
      servicePlatform: params.get("servicePlatform") ?? undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [params, keyword, page],
  );

  const { data, isLoading } = useStudents(queryParams);
  const { removeMutation } = useStudentMutations();
  const userRole = useAuthStore((state) => state.user?.role);
  const canManage = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [modalState, setModalState] = useState<{ open: boolean; mode: StudentFormMode; initial: StudentDetail | null }>(
    { open: false, mode: "create", initial: null },
  );
  const [advOpen, setAdvOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const openDetail = async (mode: StudentFormMode, row?: StudentListItem) => {
    if (mode === "create") {
      setModalState({ open: true, mode: "create", initial: null });
      return;
    }
    if (!row) return;
    const detail = await studentsApi.detail(row.id);
    setModalState({ open: true, mode, initial: detail });
  };

  const canView = selectedKeys.length === 1;
  const canEdit = selectedKeys.length === 1;
  const canDelete = selectedKeys.length >= 1;

  const handleKeywordChange = (v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set("keyword", v);
    else next.delete("keyword");
    next.delete("page");
    setParams(next);
  };

  const handlePageChange = (p: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(p));
    setParams(next);
  };

  const handleDelete = () => {

    const row = data?.items.find((i) => i.id === selectedKeys[0]);

    if (!row) return;

    openStudentDeleteConfirm({

      studentName: row.name ?? "",

      studentNo: row.studentNo,

      onConfirm: async () => {

        await removeMutation.mutateAsync(row.id);

        setSelectedKeys([]);

      },

    });

  };



  const handleExportExcel = async () => {

    try {

      await studentsApi.exportExcel();

      message.success("导出成功");

    } catch (err) {

      message.error(

        err instanceof Error ? err.message : "导出失败",

      );

    }

  };

  return (
    <div>
      <Typography.Title level={3}>学生信息管理</Typography.Title>
      <Space style={{ width: "100%", marginBottom: 12 }} wrap>
        <Button disabled={!canView} onClick={() => openDetail("view", data?.items.find((i) => i.id === selectedKeys[0]))}>
          查看
        </Button>
        {canManage && (
          <>
            <Button disabled={!canEdit} onClick={() => openDetail("edit", data?.items.find((i) => i.id === selectedKeys[0]))}>
              编辑
            </Button>
            <Button type="primary" onClick={() => openDetail("create")}>
              添加学生
            </Button>
            <Button danger disabled={!canDelete} onClick={handleDelete}>
              删除学生
            </Button>
            <Button onClick={() => setImportOpen(true)}>从 Excel 导入</Button>
            <Button icon={<ExportOutlined />} onClick={handleExportExcel}>
              导出Excel
            </Button>
          </>
        )}
        <div style={{ flex: 1 }} />
        <Input.Search
          placeholder="搜索姓名 / 学号 / 电话"
          allowClear
          defaultValue={keyword}
          onSearch={handleKeywordChange}
          style={{ width: 280 }}
        />
        <Button onClick={() => setAdvOpen(true)}>高级搜索</Button>
      </Space>

      <ActiveFilterTags />

      <Table<StudentListItem>
        rowKey="id"
        size="middle"
        loading={isLoading}
        dataSource={data?.items ?? []}
        rowSelection={{
          type: "checkbox",
          selectedRowKeys: selectedKeys,
          onChange: setSelectedKeys,
        }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          onChange: handlePageChange,
          showSizeChanger: false,
        }}
        columns={[
          { title: "学号", dataIndex: "studentNo", width: 100 },
          { title: "学生姓名", dataIndex: "name", width: 120 },
          { title: "性别", dataIndex: "gender", width: 60 },
          { title: "学校", dataIndex: "school", width: 160, render: (v) => v ?? "-" },
          { title: "专业", dataIndex: "major", width: 160, render: (v) => v ?? "-" },
          {
            title: "当前年级",
            dataIndex: "grade",
            width: 100,
            render: (v) => v ?? "-",
          },
          {
            title: "公共课剩余",
            dataIndex: "remainingPublicCredits",
            width: 110,
            render: (v) => (v == null ? "-" : v),
          },
          {
            title: "1v1 剩余",
            dataIndex: "remainingPrivateCredits",
            width: 100,
            render: (v) => (v == null ? "-" : v),
          },
          {
            title: "服务状态",
            dataIndex: "serviceStatus",
            width: 120,
            render: (v: ServiceStatus) => (
              <Tag color={SERVICE_STATUS_COLORS[v]}>{SERVICE_STATUS_LABELS[v]}</Tag>
            ),
          },
        ]}
      />

      <StudentFormModal
        open={modalState.open}
        mode={modalState.mode}
        initial={modalState.initial}
        onClose={() => setModalState((s) => ({ ...s, open: false }))}
        onModeChange={(mode) => setModalState((s) => ({ ...s, mode }))}
      />
      <AdvancedSearchDrawer open={advOpen} onClose={() => setAdvOpen(false)} />
      <StudentImportDrawer open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
