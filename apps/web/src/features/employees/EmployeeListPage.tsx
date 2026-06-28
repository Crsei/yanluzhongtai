import {

  DeleteOutlined,

  EditOutlined,

  ExportOutlined,

  EyeOutlined,

  ImportOutlined,

  PlusOutlined,

} from "@ant-design/icons";
import {
  Button,
  Input,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { useMemo, useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import {
  EMPLOYEE_BILLING_TAG_COLORS,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_STATUS_TAG_COLOR,
} from "../../constants/dictionaries";
import { confirmDeleteEmployee, confirmDeleteEmployees } from "./EmployeeDeleteConfirm";
import { EmployeeFormModal, type EmployeeFormMode } from "./EmployeeFormModal";
import { EmployeeImportDrawer } from "./EmployeeImportDrawer";
import { useEmployees } from "./hooks/useEmployees";
import { useEmployeeMutations } from "./hooks/useEmployeeMutations";
import { employeesApi } from "../../services/employees";
import type { EmployeeDetail, EmployeeListItem } from "./types";

const PAGE_SIZE = 50;

export function EmployeeListPage() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<EmployeeFormMode>("create");
  const [activeEmployee, setActiveEmployee] = useState<EmployeeDetail | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const queryParams = useMemo(
    () => ({ page, pageSize: PAGE_SIZE, keyword: keyword || undefined }),
    [page, keyword],
  );

  const { data, isLoading, isFetching } = useEmployees(queryParams);
  const mutations = useEmployeeMutations();
  const userRole = useAuthStore((state) => state.user?.role);
  const canWrite = Boolean(userRole);
  const canDeleteRecords = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  const selectedCount = selectedRowKeys.length;
  const canViewOrEdit = selectedCount === 1;
  const canDelete = selectedCount >= 1;

  const openModalForRow = async (mode: EmployeeFormMode) => {
    if (selectedRowKeys.length !== 1) return;
    try {
      const detail = await employeesApi.detail(selectedRowKeys[0]);
      setActiveEmployee(detail);
      setModalMode(mode);
      setModalOpen(true);
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : "无法加载员工详情",
      );
    }
  };

  const openCreate = () => {
    setActiveEmployee(null);
    setModalMode("create");
    setModalOpen(true);
  };

  const handleDelete = () => {
    const targets = (data?.items ?? []).filter((row) => selectedRowKeys.includes(row.id));
    if (targets.length === 0) return;
    if (targets.length === 1) {
      const target = targets[0];
      confirmDeleteEmployee(
        { id: target.id, name: target.name ?? "", jobNo: target.jobNo },
        mutations,
      );
      return;
    }
    confirmDeleteEmployees(
      targets.map((target) => ({
        id: target.id,
        name: target.name ?? "",
        jobNo: target.jobNo,
      })),
      mutations,
    );
  };

  const handleExportExcel = async () => {
    try {
      await employeesApi.exportExcel();
      message.success("导出成功");
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : "导出失败",
      );
    }
  };

  const columns = [
    { title: "工号", dataIndex: "jobNo", key: "jobNo", width: 100 },
    {
      title: "计费方式",
      dataIndex: "billingType",
      key: "billingType",
      width: 110,
      render: (value: string | null) => {
        const label = value || "常规";
        return (
          <Tag color={EMPLOYEE_BILLING_TAG_COLORS[label] ?? "blue"}>
            {label}
          </Tag>
        );
      },
    },
    { title: "姓名", dataIndex: "name", key: "name", width: 120 },
    { title: "性别", dataIndex: "gender", key: "gender", width: 80 },
    { title: "具体工作职责", dataIndex: "jobTitle", key: "jobTitle", width: 180 },
    { title: "电话号码", dataIndex: "phone", key: "phone", width: 140 },
    { title: "员工来源", dataIndex: "source", key: "source", width: 120 },
    {
      title: "正服务于",
      dataIndex: "servingFor",
      key: "servingFor",
      width: 220,
      render: (items: string[]) =>
        items?.length ? items.map((it) => <Tag key={it}>{it}</Tag>) : <span>—</span>,
    },
    {
      title: "状态",
      dataIndex: "employmentStatus",
      key: "employmentStatus",
      width: 100,
      render: (value: keyof typeof EMPLOYMENT_STATUS_LABELS) => (
        <Tag color={EMPLOYMENT_STATUS_TAG_COLOR[value]}>
          {EMPLOYMENT_STATUS_LABELS[value]}
        </Tag>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        员工信息管理
      </Typography.Title>

      <div className="sticky-toolbar employees-toolbar">
        <Space wrap>
          <Button icon={<EyeOutlined />} disabled={!canViewOrEdit} onClick={() => openModalForRow("view")}>
            查看
          </Button>
          {canWrite && (
            <>
              <Button icon={<EditOutlined />} disabled={!canViewOrEdit} onClick={() => openModalForRow("edit")}>
                编辑
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                添加员工
              </Button>
              <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>

                从 Excel 导入

              </Button>

              <Button icon={<ExportOutlined />} onClick={handleExportExcel}>

                导出Excel

              </Button>
            </>
          )}
          {canDeleteRecords && (
            <Button danger icon={<DeleteOutlined />} disabled={!canDelete} onClick={handleDelete}>
              删除员工
            </Button>
          )}
        </Space>
        <div style={{ flex: 1 }} />
        <Input.Search
          allowClear
          placeholder="搜索 工号 / 姓名 / 电话"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onSearch={(value) => {
            setKeyword(value.trim());
            setPage(1);
          }}
          style={{ width: 280 }}
        />
      </div>

      <Table<EmployeeListItem>
        rowKey="id"
        loading={isLoading || isFetching}
        dataSource={data?.items ?? []}
        columns={columns}
        scroll={{ x: 1200 }}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as string[]),
        }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          showSizeChanger: false,
          onChange: setPage,
        }}
      />

      <EmployeeFormModal
        open={modalOpen}
        mode={modalMode}
        employee={activeEmployee}
        onClose={() => {
          setModalOpen(false);
          setActiveEmployee(null);
        }}
        onModeChange={setModalMode}
      />

      <EmployeeImportDrawer open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
