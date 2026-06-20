import {
  Button,
  DatePicker,
  Dropdown,
  Input,
  Modal,
  Radio,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import type { MenuProps } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { DownOutlined, ExportOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AddManualRecordDialog } from "./AddManualRecordDialog";
import { confirmDeleteManualRecord } from "./DeleteManualRecordConfirm";
import { SettleDialog } from "./SettleDialog";
import { SettleManualRecordDialog } from "./SettleManualRecordDialog";
import { ViewCoursesDialog } from "./ViewCoursesDialog";
import { payrollApi } from "../../services/payroll";
import { usePayroll } from "./hooks/usePayroll";
import { usePayrollMutations } from "./hooks/usePayrollMutations";
import { EMPLOYEE_BILLING_TAG_COLORS } from "../../constants/dictionaries";
import type {
  PayrollAutoRow,
  PayrollRangeMode,
  PayrollRow,
  PayrollQueryParams,
  PayrollManualRow,
  PayrollTeachingType,
} from "./types";

function formatPeriodFromDayjs(d: Dayjs): string {
  return d.format("YYYYMM");
}

function currentPeriod(): string {
  return dayjs().format("YYYYMM");
}

function previousPeriod(): string {
  return dayjs().subtract(1, "month").format("YYYYMM");
}

type PayrollAutoChildRow = PayrollAutoRow & { parentGroupId: string };

type PayrollGroupRow = {
  kind: "group";
  id: string;
  employeeJobNo: string;
  employeeName: string;
  employeeBillingType: string;
  period: string;
  teachingType: null;
  hourlyRate: null;
  deliveredHours: number;
  totalCourseFee: number | null;
  extraLabor: number;
  extraDeduction: number;
  subtotalPayable: number | null;
  subtotalPaid: number;
  children: PayrollAutoChildRow[];
};

type PayrollDisplayRow = PayrollRow | PayrollAutoChildRow | PayrollGroupRow;

function autoRowKey(r: PayrollAutoRow): string {
  return `auto:${r.employeeJobNo}:${r.period}:${r.teachingType}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isGroupedChild(row: PayrollDisplayRow): row is PayrollAutoChildRow {
  return row.kind === "auto" && "parentGroupId" in row;
}

function BillingTypeTag({ value }: { value: string }) {
  if (!value || value === "常规") return null;
  return (
    <Tag color={EMPLOYEE_BILLING_TAG_COLORS[value] ?? "blue"} style={{ marginInlineStart: 6 }}>
      {value}
    </Tag>
  );
}

function buildPayrollDisplayRows(items: PayrollRow[]): PayrollDisplayRow[] {
  const autoGroups = new Map<string, PayrollAutoRow[]>();
  for (const row of items) {
    if (row.kind !== "auto") continue;
    const key = `${row.employeeName}::${row.period}`;
    const group = autoGroups.get(key) ?? [];
    group.push(row);
    autoGroups.set(key, group);
  }

  const groupedKeys = new Set<string>();
  for (const [key, rows] of autoGroups) {
    const billingTypes = new Set(rows.map((row) => row.employeeBillingType));
    if (billingTypes.size > 1) groupedKeys.add(key);
  }

  const emittedGroups = new Set<string>();
  const result: PayrollDisplayRow[] = [];
  for (const row of items) {
    if (row.kind !== "auto") {
      result.push(row);
      continue;
    }

    const key = `${row.employeeName}::${row.period}`;
    if (!groupedKeys.has(key)) {
      result.push(row);
      continue;
    }
    if (emittedGroups.has(key)) continue;

    emittedGroups.add(key);
    const children = [...(autoGroups.get(key) ?? [])]
      .sort((a, b) => {
        const byBilling = a.employeeBillingType.localeCompare(
          b.employeeBillingType,
          "zh-Hans-CN",
          { sensitivity: "base" },
        );
        if (byBilling !== 0) return byBilling;
        return a.teachingType.localeCompare(b.teachingType, "zh-Hans-CN", {
          sensitivity: "base",
        });
      })
      .map((child) => ({ ...child, parentGroupId: key }));

    const payableValues = children
      .map((child) => child.subtotalPayable)
      .filter((value): value is number => value != null);
    result.push({
      kind: "group",
      id: key,
      employeeJobNo: "多条记录",
      employeeName: row.employeeName,
      employeeBillingType: "多种",
      period: row.period,
      teachingType: null,
      hourlyRate: null,
      deliveredHours: round2(children.reduce((sum, child) => sum + child.deliveredHours, 0)),
      totalCourseFee: round2(children.reduce((sum, child) => sum + (child.totalCourseFee ?? 0), 0)),
      extraLabor: round2(children.reduce((sum, child) => sum + child.extraLabor, 0)),
      extraDeduction: round2(children.reduce((sum, child) => sum + child.extraDeduction, 0)),
      subtotalPayable:
        payableValues.length === children.length
          ? round2(payableValues.reduce((sum, value) => sum + value, 0))
          : null,
      subtotalPaid: round2(children.reduce((sum, child) => sum + child.subtotalPaid, 0)),
      children,
    });
  }

  return result;
}

function readParams(sp: URLSearchParams): {
  params: PayrollQueryParams;
  mode: PayrollRangeMode;
} {
  const from = sp.get("from");
  const to = sp.get("to");
  const keyword = sp.get("keyword") ?? undefined;
  const unpaidOnly = sp.get("unpaidOnly") === "1";

  let mode: PayrollRangeMode = "current";
  let effectiveFrom = currentPeriod();
  let effectiveTo = currentPeriod();

  if (from && to) {
    effectiveFrom = from;
    effectiveTo = to;
    if (from === currentPeriod() && to === currentPeriod()) mode = "current";
    else if (from === previousPeriod() && to === previousPeriod())
      mode = "previous";
    else mode = "custom";
  }

  return {
    params: {
      from: effectiveFrom,
      to: effectiveTo,
      keyword,
      unpaidOnly: unpaidOnly || undefined,
    },
    mode,
  };
}

function writeParams(
  next: PayrollQueryParams,
  set: (q: URLSearchParams) => void,
): void {
  const qp = new URLSearchParams();
  qp.set("from", next.from);
  qp.set("to", next.to);
  if (next.keyword) qp.set("keyword", next.keyword);
  if (next.unpaidOnly) qp.set("unpaidOnly", "1");
  set(qp);
}

function MoneyCell({
  value,
  red = false,
}: {
  value: number | null | undefined;
  red?: boolean;
}) {
  if (value == null) return <span>—</span>;
  const text = `${value.toFixed(2)} 元`;
  return red ? <span className="payroll-money-red">{text}</span> : <span>{text}</span>;
}

export function PayrollListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { params, mode } = useMemo(() => readParams(searchParams), [searchParams]);
  const [rangeMode, setRangeMode] = useState<PayrollRangeMode>(mode);

  useEffect(() => {
    setRangeMode(mode);
  }, [mode]);

  const [keyword, setKeyword] = useState(params.keyword ?? "");
  useEffect(() => {
    setKeyword(params.keyword ?? "");
  }, [params.keyword]);

  const listQ = usePayroll(params);
  const { deleteManual } = usePayrollMutations();
  const displayRows = useMemo(
    () => buildPayrollDisplayRows(listQ.data?.items ?? []),
    [listQ.data?.items],
  );

  const [manualOpen, setManualOpen] = useState(false);
  const [settleFor, setSettleFor] = useState<{
    teacherJobNo: string;
    teacherName: string;
    period: string;
    teachingType: PayrollTeachingType;
  } | null>(null);
  const [viewCoursesFor, setViewCoursesFor] = useState<{
    teacherJobNo: string;
    teacherName: string;
    period: string;
    teachingType: PayrollTeachingType;
  } | null>(null);
  const [manualSettleFor, setManualSettleFor] = useState<PayrollManualRow | null>(null);

  const applyMode = (next: PayrollRangeMode) => {
    setRangeMode(next);
    if (next === "current") {
      writeParams(
        { ...params, from: currentPeriod(), to: currentPeriod() },
        setSearchParams,
      );
    } else if (next === "previous") {
      writeParams(
        { ...params, from: previousPeriod(), to: previousPeriod() },
        setSearchParams,
      );
    }
    // custom: keep current params so the RangePicker can open and then write them.
  };

  const applyCustomRange = (range: [Dayjs | null, Dayjs | null] | null) => {
    if (!range || !range[0] || !range[1]) return;
    writeParams(
      {
        ...params,
        from: formatPeriodFromDayjs(range[0]),
        to: formatPeriodFromDayjs(range[1]),
      },
      setSearchParams,
    );
  };

  const runSearch = () =>
    writeParams({ ...params, keyword: keyword || undefined }, setSearchParams);

  const toggleUnpaid = (checked: boolean) =>
    writeParams(
      { ...params, unpaidOnly: checked || undefined },
      setSearchParams,
    );

  const askAddManual = () => {
    Modal.confirm({
      title: "手动添加薪酬记录",
      content:
        "手动添加的记录无法联动计算课时费,仅是强制追加一条劳务/扣除记录。是否继续?",
      okText: "继续",
      cancelText: "取消",
      onOk: () => setManualOpen(true),
    });
  };

  const onDeleteManual = (row: PayrollRow) => {
    if (row.kind !== "manual") return;
    confirmDeleteManualRecord({
      period: row.period,
      employeeName: row.employeeName,
      onConfirm: () => deleteManual.mutateAsync(row.id),
    });
  };

  const openAutoSettle = (row: PayrollAutoRow) => {
    setSettleFor({
      teacherJobNo: row.employeeJobNo,
      teacherName: row.employeeName,
      period: row.period,
      teachingType: row.teachingType,
    });
  };

  const openAutoCourses = (row: PayrollAutoRow) => {
    setViewCoursesFor({
      teacherJobNo: row.employeeJobNo,
      teacherName: row.employeeName,
      period: row.period,
      teachingType: row.teachingType,
    });
  };

  const autoMenuItems = (rows: PayrollAutoRow[]): MenuProps["items"] =>
    rows.map((row) => ({
      key: autoRowKey(row),
      label: `${row.employeeBillingType} / ${row.teachingType}`,
    }));

  const findAutoChild = (rows: PayrollAutoRow[], key: string) =>
    rows.find((row) => autoRowKey(row) === key);

  const handleExportExcel = async () => {
    await payrollApi.exportExcel(params);
  };

  const columns = [
    {
      title: "操作",
      key: "action",
      width: 180,
      render: (_: unknown, r: PayrollDisplayRow) => {
        if (isGroupedChild(r)) return <span>—</span>;
        if (r.kind === "group") {
          return (
            <Space size="small">
              <Dropdown
                menu={{
                  items: autoMenuItems(r.children),
                  onClick: ({ key }) => {
                    const child = findAutoChild(r.children, key);
                    if (child) openAutoCourses(child);
                  },
                }}
              >
                <Button type="link" size="small">
                  查看课程 <DownOutlined />
                </Button>
              </Dropdown>
              <Dropdown
                menu={{
                  items: r.children.map((child) => ({
                    key: autoRowKey(child),
                    label: `${child.employeeBillingType} / ${child.teachingType}`,
                    disabled: child.subtotalPayable == null,
                  })),
                  onClick: ({ key }) => {
                    const child = findAutoChild(r.children, key);
                    if (child) openAutoSettle(child);
                  },
                }}
              >
                <Button type="link" size="small">
                  结算 <DownOutlined />
                </Button>
              </Dropdown>
            </Space>
          );
        }
        if (r.kind === "auto") {
          const settleDisabled = r.subtotalPayable == null;
          return (
            <Space size="small">
              <Button
                type="link"
                size="small"
                onClick={() => openAutoCourses(r)}
              >
                查看课程
              </Button>
              <Button
                type="link"
                size="small"
                disabled={settleDisabled}
                onClick={() => openAutoSettle(r)}
              >
                结算
              </Button>
            </Space>
          );
        }
        const remaining = r.subtotalPayable - r.subtotalPaid;
        return (
          <Space size="small">
            <Button
              type="link"
              size="small"
              disabled={remaining <= 1e-6}
              onClick={() => setManualSettleFor(r)}
            >
              结算
            </Button>
            <Button
              type="link"
              size="small"
              danger
              onClick={() => onDeleteManual(r)}
            >
              删除记录
            </Button>
          </Space>
        );
      },
    },
    { title: "工号", dataIndex: "employeeJobNo", width: 100 },
    {
      title: "老师姓名",
      dataIndex: "employeeName",
      width: 180,
      render: (value: string, row: PayrollDisplayRow) => (
        <span>
          {value}
          {row.kind === "group" ? (
            row.children.map((child) => (
              <BillingTypeTag
                key={`${child.employeeJobNo}:${child.employeeBillingType}:${child.teachingType}`}
                value={child.employeeBillingType}
              />
            ))
          ) : (
            <BillingTypeTag value={row.employeeBillingType} />
          )}
        </span>
      ),
    },
    { title: "所属年月", dataIndex: "period", width: 100 },
    {
      title: "授课方式",
      dataIndex: "teachingType",
      width: 100,
      render: (v: PayrollDisplayRow["teachingType"]) => v ?? "—",
    },
    {
      title: "单位课时费",
      dataIndex: "hourlyRate",
      width: 140,
      render: (v: number | null) => <MoneyCell value={v} />,
    },
    {
      title: "已授课时",
      dataIndex: "deliveredHours",
      width: 110,
      render: (v: number) => v.toFixed(2),
    },
    {
      title: "总课时费",
      dataIndex: "totalCourseFee",
      width: 140,
      render: (v: number | null) => <MoneyCell value={v} />,
    },
    {
      title: "其他劳务",
      dataIndex: "extraLabor",
      width: 120,
      render: (v: number) => <MoneyCell value={v} />,
    },
    {
      title: "其他扣除",
      dataIndex: "extraDeduction",
      width: 120,
      render: (v: number) => <MoneyCell value={v} />,
    },
    {
      title: "应结算薪资",
      dataIndex: "subtotalPayable",
      width: 140,
      render: (v: number | null) => <MoneyCell value={v} red />,
    },
    {
      title: "已结算薪资",
      dataIndex: "subtotalPaid",
      width: 140,
      render: (v: number) => <MoneyCell value={v} />,
    },
  ];

  const rowKey = (r: PayrollDisplayRow) => {
    if (r.kind === "group") return `group:${r.id}`;
    return r.kind === "auto" ? autoRowKey(r) : `manual:${r.id}`;
  };

  return (
    <div>
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        员工薪酬管理
      </Typography.Title>

      <div className="payroll-toolbar">
        <Space wrap>
          <Input.Search
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={runSearch}
            placeholder="老师姓名 / 工号"
            style={{ width: 280 }}
            allowClear
            enterButton={<SearchOutlined />}
          />
          <Radio.Group
            value={rangeMode}
            onChange={(e) => applyMode(e.target.value as PayrollRangeMode)}
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: "本月", value: "current" },
              { label: "上月", value: "previous" },
              { label: "自定义", value: "custom" },
            ]}
          />
          {rangeMode === "custom" ? (
            <DatePicker.RangePicker
              picker="month"
              format="YYYY-MM"
              value={[
                dayjs(`${params.from.slice(0, 4)}-${params.from.slice(4, 6)}-01`),
                dayjs(`${params.to.slice(0, 4)}-${params.to.slice(4, 6)}-01`),
              ]}
              onChange={(range) =>
                applyCustomRange(range as [Dayjs | null, Dayjs | null] | null)
              }
            />
          ) : null}
          <Space size={4}>
            <span>仅查看薪资未结清</span>
            <Switch
              checked={Boolean(params.unpaidOnly)}
              onChange={toggleUnpaid}
            />
          </Space>
        </Space>
        <div style={{ flex: 1 }} />
        <Button
          icon={<ExportOutlined />}
          onClick={handleExportExcel}
          style={{ marginRight: 8 }}
        >
          导出Excel
        </Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={askAddManual}>
          手动添加记录
        </Button>
      </div>

      <Table<PayrollDisplayRow>
        rowKey={rowKey}
        dataSource={displayRows}
        columns={columns}
        loading={listQ.isLoading}
        scroll={{ x: 1500 }}
        pagination={{ defaultPageSize: 50, showSizeChanger: true }}
      />

      <AddManualRecordDialog
        open={manualOpen}
        onClose={() => setManualOpen(false)}
      />
      {settleFor ? (
        <SettleDialog
          open={Boolean(settleFor)}
          teacherJobNo={settleFor.teacherJobNo}
          teacherName={settleFor.teacherName}
          period={settleFor.period}
          teachingType={settleFor.teachingType}
          onClose={() => setSettleFor(null)}
        />
      ) : null}
      {viewCoursesFor ? (
        <ViewCoursesDialog
          open={Boolean(viewCoursesFor)}
          teacherJobNo={viewCoursesFor.teacherJobNo}
          teacherName={viewCoursesFor.teacherName}
          period={viewCoursesFor.period}
          teachingType={viewCoursesFor.teachingType}
          onClose={() => setViewCoursesFor(null)}
        />
      ) : null}
      <SettleManualRecordDialog
        open={Boolean(manualSettleFor)}
        row={manualSettleFor}
        onClose={() => setManualSettleFor(null)}
      />
    </div>
  );
}
