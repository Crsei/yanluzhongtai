import {
  DeleteOutlined,
  EditOutlined,
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
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import {
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_STATUS_TAG_COLOR,
} from "../../constants/dictionaries";
import { confirmDeleteEmployee } from "./EmployeeDeleteConfirm";
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
  const canManage = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  const selectedCount = selectedRowKeys.length;
  const canViewOrEdit = selectedCount === 1;
  const canDelete = selectedCount === 1;

  const openModalForRow = async (mode: EmployeeFormMode) => {
    if (selectedRowKeys.length !== 1) return;
    try {
      const detail = await employeesApi.detail(selectedRowKeys[0]);
      setActiveEmployee(detail);
      setModalMode(mode);
      setModalOpen(true);
    } catch (err) {
      message.error("无法加载员工详情");
    }
  };

  const openCreate = () => {
    setActiveEmployee(null);
    setModalMode("create");
    setModalOpen(true);
  };

  const handleDelete = () => {
    const target = (data?.items ?? []).find((row) => row.id === selectedRowKeys[0]);
    if (!target) return;
    confirmDeleteEmployee(
      { id: target.id, name: target.name ?? "", jobNo: target.jobNo },
      mutations,
    );
  };

  const columns = [
    { title: "工号", dataIndex: "jobNo", key: "jobNo", width: 100 },
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
    {
      title: "入职日期",
      dataIndex: "hireDate",
      key: "hireDate",
      width: 120,
      render: (value: string | null) => (value ? dayjs(value).format("YYYY-MM-DD") : "—"),
    },
  ];

  return (
    <div>
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        员工信息管理
      </Typography.Title>

      <div className="employees-toolbar">
        <Space wrap>
          <Button icon={<EyeOutlined />} disabled={!canViewOrEdit} onClick={() => openModalForRow("view")}>
            查看
          </Button>
          {canManage && (
            <>
              <Button icon={<EditOutlined />} disabled={!canViewOrEdit} onClick={() => openModalForRow("edit")}>
                编辑
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                添加员工
              </Button>
              <Button danger icon={<DeleteOutlined />} disabled={!canDelete} onClick={handleDelete}>
                删除员工
              </Button>
              <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>
                从 Excel 导入
              </Button>
            </>
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
