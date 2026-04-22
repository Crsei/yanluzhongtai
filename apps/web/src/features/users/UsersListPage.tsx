import { PlusOutlined, StopOutlined, SyncOutlined } from "@ant-design/icons";
import { Button, Input, Space, Switch, Table, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import { type UserRole } from "../auth/types";
import { RoleDropdown } from "./RoleDropdown";
import { useUsers } from "./hooks/useUsers";
import type { UserListItem } from "./types";

const PAGE_SIZE = 50;

export function UsersListPage() {
  const viewer = useAuthStore((s) => s.user);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [includeDeactivated, setIncludeDeactivated] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<UserListItem | null>(null);

  const params = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      keyword: keyword || undefined,
      includeDeactivated,
    }),
    [page, keyword, includeDeactivated],
  );
  const { data, isLoading, isFetching } = useUsers(params);

  if (!viewer) return null;
  const isSuperAdmin = viewer.role === "SUPER_ADMIN";

  const columns = [
    { title: "注册手机号", dataIndex: "phone", key: "phone", width: 140 },
    { title: "用户名", dataIndex: "username", key: "username", width: 160 },
    {
      title: "用户权限",
      dataIndex: "role",
      key: "role",
      width: 160,
      render: (role: UserRole, row: UserListItem) => (
        <RoleDropdown
          targetId={row.id}
          targetRole={role}
          targetUsername={row.username}
          disabled={!!row.deactivatedAt}
        />
      ),
    },
    {
      title: "注册时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 160,
      render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm"),
    },
    {
      title: "最近访问时间",
      dataIndex: "lastLoginAt",
      key: "lastLoginAt",
      width: 160,
      render: (v: string | null) => (v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "—"),
    },
    {
      title: "状态",
      dataIndex: "deactivatedAt",
      key: "status",
      width: 100,
      render: (v: string | null) =>
        v ? <Tag color="default">已注销</Tag> : <Tag color="success">在用</Tag>,
    },
    {
      title: "操作",
      key: "actions",
      width: 240,
      render: (_: unknown, row: UserListItem) => {
        const isSelf = row.id === viewer.id;
        const isDeactivated = !!row.deactivatedAt;
        const adminDisabled = !isSuperAdmin || isSelf || isDeactivated;
        return (
          <Space>
            <Button
              size="small"
              icon={<SyncOutlined />}
              disabled={adminDisabled}
              onClick={() => setResetTargetId(row.id)}
            >
              重置密码
            </Button>
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              disabled={adminDisabled}
              onClick={() => setDeactivateTarget(row)}
            >
              注销
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        全部用户管理
      </Typography.Title>

      <div className="users-toolbar">
        <Space wrap>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!isSuperAdmin}
            onClick={() => setRegisterOpen(true)}
          >
            注册账号
          </Button>
          <span>
            <Switch
              checked={includeDeactivated}
              onChange={(v) => {
                setIncludeDeactivated(v);
                setPage(1);
              }}
            />{" "}
            显示已注销
          </span>
        </Space>
        <div style={{ flex: 1 }} />
        <Input.Search
          allowClear
          placeholder="搜索 手机号 / 用户名"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onSearch={(value) => {
            setKeyword(value.trim());
            setPage(1);
          }}
          style={{ width: 280 }}
        />
      </div>

      <Table<UserListItem>
        rowKey="id"
        loading={isLoading || isFetching}
        dataSource={data?.items ?? []}
        columns={columns}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          showSizeChanger: false,
          onChange: setPage,
        }}
      />

      {/* Admin modals wired in Task 20 */}
      {registerOpen && <div data-testid="register-placeholder" />}
      {resetTargetId && <div data-testid="reset-placeholder" />}
      {deactivateTarget && <div data-testid="deactivate-placeholder" />}
    </div>
  );
}
