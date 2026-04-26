import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  ImportOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Button,
  Input,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  COURSE_STATUS_COLORS,
  COURSE_STATUS_LABELS,
  type CourseStatus,
  type TeachingType,
} from "../../constants/dictionaries";
import { useAuthStore } from "../../stores/authStore";
import { CourseFormModal } from "./CourseFormModal";
import { CourseImportDrawer } from "./CourseImportDrawer";
import { confirmDeleteCourses } from "./CourseDeleteConfirm";
import { useCourse } from "./hooks/useCourse";
import { useCourseMutations } from "./hooks/useCourseMutations";
import { useCourses } from "./hooks/useCourses";
import type { CourseListItem, CourseQueryParams } from "./types";

function readParams(sp: URLSearchParams): CourseQueryParams {
  const get = (k: string) => sp.get(k) || undefined;
  return {
    keyword: get("keyword"),
    name: get("name"),
    secondaryCategoryName: get("secondaryCategoryName"),
    sectionCode: get("sectionCode"),
    actualTeachingType: get("actualTeachingType") as TeachingType | undefined,
    actualTeacherJobNo: get("actualTeacherJobNo"),
    studentId: get("studentId"),
    status: get("status") as CourseStatus | undefined,
    plannedAtFrom: get("plannedAtFrom"),
    plannedAtTo: get("plannedAtTo"),
    page: sp.get("page") ? Number(sp.get("page")) : 1,
    pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : 50,
  };
}

function writeParams(
  next: CourseQueryParams,
  set: (q: URLSearchParams, opts?: { replace?: boolean }) => void,
): void {
  const qp = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) {
    if (v !== undefined && v !== null && v !== "") qp.set(k, String(v));
  }
  set(qp);
}

export function CourseListPage() {
  const role = useAuthStore((s) => s.user?.role);
  const canManage = role === "SUPER_ADMIN" || role === "ADMIN";
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo(() => readParams(searchParams), [searchParams]);
  const [keyword, setKeyword] = useState(params.keyword ?? "");

  useEffect(() => {
    setKeyword(params.keyword ?? "");
  }, [params.keyword]);

  const listQ = useCourses(params);
  const { removeMany } = useCourseMutations();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formMode, setFormMode] = useState<"create" | "edit" | "view" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const editQ = useCourse(editId);

  const rows = listQ.data?.items ?? [];
  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.includes(r.id)),
    [rows, selectedIds],
  );

  const runSearch = () =>
    writeParams({ ...params, keyword: keyword || undefined, page: 1 }, setSearchParams);

  const openCreate = () => {
    setEditId(null);
    setFormMode("create");
  };
  const openEditOrView = (mode: "edit" | "view") => {
    if (selectedIds.length !== 1) return;
    setEditId(selectedIds[0]);
    setFormMode(mode);
  };

  const onDelete = () => {
    confirmDeleteCourses(
      selectedRows.map((r) => ({ id: r.id, courseNo: r.courseNo, name: r.name ?? "" })),
      async () => {
        await removeMany.mutateAsync(selectedIds);
        setSelectedIds([]);
      },
    );
  };

  const columns = [
    { title: "课程编号", dataIndex: "courseNo", width: 140 },
    { title: "课程名称", dataIndex: "name" },
    {
      title: "所属板块",
      key: "section",
      width: 140,
      render: (_: unknown, r: CourseListItem) =>
        r.sectionName || r.sectionCode ? `${r.sectionName ?? "未命名"} (${r.sectionCode ?? "无代码"})` : "—",
    },
    {
      title: "计划授课时间",
      dataIndex: "plannedAt",
      width: 180,
      render: (v: string | null) =>
        v ? new Date(v).toLocaleString("zh-CN", { hour12: false }) : "—",
    },
    {
      title: "课程状态",
      dataIndex: "status",
      width: 110,
      render: (v: CourseStatus) => (
        <Tag color={COURSE_STATUS_COLORS[v]}>{COURSE_STATUS_LABELS[v]}</Tag>
      ),
    },
    {
      title: "授课方式",
      dataIndex: "actualTeachingType",
      width: 110,
      render: (v: string | null) => v ?? "—",
    },
    {
      title: "实际授课老师",
      key: "teacher",
      width: 160,
      render: (_: unknown, r: CourseListItem) =>
        r.actualTeacher ? (
          <span>
            {r.actualTeacher.name}
            {r.actualTeacher.employmentStatus === "RESIGNED" ? (
              <Tag color="red" style={{ marginLeft: 8 }}>
                已离职
              </Tag>
            ) : null}
          </span>
        ) : (
          "—"
        ),
    },
    {
      title: "学生数",
      dataIndex: "enrolledStudentCount",
      width: 80,
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <Typography.Title level={2} style={{ marginTop: 0 }}>
          学生选课与课程信息管理
        </Typography.Title>
        <Button type="link" onClick={() => navigate("/courses/outline")}>
          前往课程大纲 →
        </Button>
      </div>

      <div className="course-list-toolbar">
        <Space wrap>
          <Button
            icon={<EyeOutlined />}
            disabled={selectedIds.length !== 1}
            onClick={() => openEditOrView("view")}
          >
            查看课程信息
          </Button>
          {canManage ? (
            <>
              <Button
                icon={<EditOutlined />}
                disabled={selectedIds.length !== 1}
                onClick={() => openEditOrView("edit")}
              >
                编辑课程信息
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={openCreate}
              >
                添加课程
              </Button>
              <Button
                danger
                icon={<DeleteOutlined />}
                disabled={selectedIds.length === 0}
                onClick={onDelete}
              >
                删除课程
              </Button>
              <Button
                icon={<ImportOutlined />}
                onClick={() => setImportOpen(true)}
              >
                从 Excel 导入
              </Button>
            </>
          ) : null}
        </Space>
        <div style={{ flex: 1 }} />
        <Space>
          <Input.Search
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={runSearch}
            placeholder="课程编号 / 名称 / 类别"
            style={{ width: 280 }}
            allowClear
            enterButton={<SearchOutlined />}
          />
          <Link to="/courses/advanced-search">
            <Button>高级搜索</Button>
          </Link>
        </Space>
      </div>

      <Table<CourseListItem>
        rowKey="id"
        dataSource={rows}
        columns={columns}
        loading={listQ.isLoading}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys as string[]),
          preserveSelectedRowKeys: true,
        }}
        pagination={{
          current: params.page ?? 1,
          pageSize: params.pageSize ?? 50,
          total: listQ.data?.total ?? 0,
          onChange: (page, pageSize) =>
            writeParams({ ...params, page, pageSize }, setSearchParams),
        }}
      />

      <CourseFormModal
        open={formMode !== null}
        mode={formMode ?? "view"}
        course={editQ.data ?? null}
        onClose={() => {
          setFormMode(null);
          setEditId(null);
        }}
      />
      <CourseImportDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
      />
    </div>
  );
}
