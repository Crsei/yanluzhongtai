import { Button, DatePicker, Input, Space, Table, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { useAuditLogs } from "./hooks/useAuditLogs";
import { auditLogsApi } from "../../services/auditLogs";
import type { AuditLogItem, AuditLogQueryParams } from "./types";

type FilterState = {
  operatorId?: string;
  targetType?: string;
  action?: string;
  range?: [Dayjs | null, Dayjs | null] | null;
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  employee: "员工",
  student: "学生",
  course: "课程",
  course_outline_version: "课程大纲版本",
  payroll_settlement: "薪酬结算",
  payroll_manual_record: "手动薪酬记录",
  quick_link: "数据表链接",
  user: "用户",
};

const ACTION_LABELS: Record<string, string> = {
  create: "新增",
  update: "更新",
  delete: "删除",
  settle: "结算",
  "employee.create": "新增员工",
  "employee.update": "更新员工",
  "employee.delete": "删除员工",
  "student.create": "新增学生",
  "student.update": "更新学生",
  "student.delete": "删除学生",
  "course.create": "新增课程",
  "course.update": "更新课程",
  "course.delete": "删除课程",
  "payroll_manual_record.create": "新增手动薪酬记录",
  "payroll_manual_record.delete": "删除手动薪酬记录",
};

const FIELD_LABELS: Record<string, string> = {
  name: "名称",
  employeeName: "老师姓名",
  studentName: "学生姓名",
  billingType: "计费方式",
  employmentStatus: "在职状态",
  serviceStatus: "服务状态",
  totalPublicCredits: "GPA+外语+竞赛总课时",
  totalPrivateCredits: "总 1v1 课时",
  extraLabor: "其他劳务",
  extraDeduction: "其他扣除",
  subtotalPaid: "已结算薪资",
};

function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function formatTargetType(targetType: string): string {
  return TARGET_TYPE_LABELS[targetType] ?? targetType;
}

function formatFieldName(fieldName: string | null): string {
  if (!fieldName) return "—";
  return FIELD_LABELS[fieldName] ?? fieldName;
}

function formatAuditValue(value: string | null): string {
  if (value == null || value === "null") return "—";
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed == null) return "—";
    if (typeof parsed === "string" || typeof parsed === "number" || typeof parsed === "boolean") {
      return String(parsed);
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return value;
  }
}

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
    {
      title: "动作",
      dataIndex: "action",
      width: 180,
      render: (action: string) => formatAction(action),
    },
    {
      title: "目标类型",
      dataIndex: "targetType",
      width: 160,
      render: (targetType: string) => formatTargetType(targetType),
    },
    { title: "目标 ID", dataIndex: "targetId", width: 200 },
    {
      title: "字段",
      dataIndex: "fieldName",
      width: 160,
      render: (fieldName: string | null) => formatFieldName(fieldName),
    },
    {
      title: "前值",
      dataIndex: "beforeValue",
      width: 260,
      ellipsis: true,
      render: (value: string | null) => formatAuditValue(value),
    },
    {
      title: "后值",
      dataIndex: "afterValue",
      width: 260,
      ellipsis: true,
      render: (value: string | null) => formatAuditValue(value),
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

  const onExport = async () => {
    try {
      await auditLogsApi.exportExcel(queryParams);
      message.success("导出成功");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "导出失败");
    }
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
        <Button onClick={onExport}>导出 Excel</Button>
      </Space>
      <Table<AuditLogItem>
        rowKey="id"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isLoading}
        scroll={{ x: 1440 }}
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
