import { Button, DatePicker, Input, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { useAuditLogs } from "./hooks/useAuditLogs";
import type { AuditLogItem, AuditLogQueryParams } from "./types";

type FilterState = {
  operatorId?: string;
  targetType?: string;
  action?: string;
  range?: [Dayjs | null, Dayjs | null] | null;
};

export function AuditLogListPage() {
  const [filters, setFilters] = useState<FilterState>({});
  const [draft, setDraft] = useState<FilterState>({});
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const queryParams: AuditLogQueryParams = {
    page,
    pageSize,
    operatorId: filters.operatorId,
    targetType: filters.targetType,
    action: filters.action,
    fromDate: filters.range?.[0]?.toISOString(),
    toDate: filters.range?.[1]?.toISOString(),
  };

  const { data, isLoading } = useAuditLogs(queryParams);

  const columns: ColumnsType<AuditLogItem> = [
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 180,
      render: (iso: string) => dayjs(iso).format("YYYY-MM-DD HH:mm:ss"),
    },
    {
      title: "操作人",
      width: 180,
      render: (_: unknown, row: AuditLogItem) =>
        row.operatorUsername
          ? `${row.operatorUsername}（${row.operatorPhone?.slice(-4) ?? "----"}）`
          : "系统",
    },
    { title: "动作", dataIndex: "action", width: 180 },
    { title: "目标类型", dataIndex: "targetType", width: 160 },
    { title: "目标 ID", dataIndex: "targetId", width: 200 },
    { title: "字段", dataIndex: "fieldName", width: 120 },
    {
      title: "前值",
      dataIndex: "beforeValue",
      ellipsis: true,
    },
    {
      title: "后值",
      dataIndex: "afterValue",
      ellipsis: true,
    },
  ];

  const onSearch = () => {
    setFilters(draft);
    setPage(1);
  };

  const onReset = () => {
    setDraft({});
    setFilters({});
    setPage(1);
  };

  return (
    <div className="audit-log-page">
      <Typography.Title level={2}>中台日志</Typography.Title>
      <Space wrap size={12} style={{ marginBottom: 16 }}>
        <Input
          placeholder="操作人 ID"
          value={draft.operatorId ?? ""}
          onChange={(e) =>
            setDraft((prev) => ({ ...prev, operatorId: e.target.value }))
          }
          style={{ width: 220 }}
        />
        <Input
          placeholder="动作（如 quick_link.create）"
          value={draft.action ?? ""}
          onChange={(e) => setDraft((prev) => ({ ...prev, action: e.target.value }))}
          style={{ width: 240 }}
        />
        <Input
          placeholder="目标类型（如 quick_link）"
          value={draft.targetType ?? ""}
          onChange={(e) =>
            setDraft((prev) => ({ ...prev, targetType: e.target.value }))
          }
          style={{ width: 200 }}
        />
        <DatePicker.RangePicker
          showTime
          value={draft.range ?? undefined}
          onChange={(range) =>
            setDraft((prev) => ({
              ...prev,
              range: range as [Dayjs | null, Dayjs | null] | null,
            }))
          }
        />
        <Button type="primary" onClick={onSearch}>
          查询
        </Button>
        <Button onClick={onReset}>重置</Button>
      </Space>
      <Table<AuditLogItem>
        rowKey="id"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isLoading}
        pagination={{
          current: page,
          pageSize,
          total: data?.total ?? 0,
          onChange: (next) => setPage(next),
        }}
      />
    </div>
  );
}
