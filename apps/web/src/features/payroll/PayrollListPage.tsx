import {
  Button,
  DatePicker,
  Input,
  Modal,
  Radio,
  Space,
  Switch,
  Table,
  Typography,
} from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AddManualRecordDialog } from "./AddManualRecordDialog";
import { confirmDeleteManualRecord } from "./DeleteManualRecordConfirm";
import { SettleDialog } from "./SettleDialog";
import { ViewCoursesDialog } from "./ViewCoursesDialog";
import { usePayroll } from "./hooks/usePayroll";
import { usePayrollMutations } from "./hooks/usePayrollMutations";
import type {
  PayrollRangeMode,
  PayrollRow,
  PayrollQueryParams,
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

  const [keyword, setKeyword] = useState(params.keyword ?? "");
  useEffect(() => {
    setKeyword(params.keyword ?? "");
  }, [params.keyword]);

  const listQ = usePayroll(params);
  const { deleteManual } = usePayrollMutations();

  const [manualOpen, setManualOpen] = useState(false);
  const [settleFor, setSettleFor] = useState<{
    teacherJobNo: string;
    teacherName: string;
    period: string;
  } | null>(null);
  const [viewCoursesFor, setViewCoursesFor] = useState<{
    teacherJobNo: string;
    teacherName: string;
    period: string;
  } | null>(null);

  const applyMode = (next: PayrollRangeMode) => {
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
    // custom: leave params alone; the RangePicker below writes them
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

  const columns = [
    {
      title: "操作",
      key: "action",
      width: 180,
      render: (_: unknown, r: PayrollRow) => {
        if (r.kind === "auto") {
          const remaining =
            r.subtotalPayable != null
              ? r.subtotalPayable - r.subtotalPaid
              : null;
          const settleDisabled =
            r.subtotalPayable == null ||
            (remaining != null && remaining <= 1e-6);
          return (
            <Space size="small">
              <Button
                type="link"
                size="small"
                onClick={() =>
                  setViewCoursesFor({
                    teacherJobNo: r.employeeJobNo,
                    teacherName: r.employeeName,
                    period: r.period,
                  })
                }
              >
                查看课程
              </Button>
              <Button
                type="link"
                size="small"
                disabled={settleDisabled}
                onClick={() =>
                  setSettleFor({
                    teacherJobNo: r.employeeJobNo,
                    teacherName: r.employeeName,
                    period: r.period,
                  })
                }
              >
                结算
              </Button>
            </Space>
          );
        }
        return (
          <Button
            type="link"
            size="small"
            danger
            onClick={() => onDeleteManual(r)}
          >
            删除记录
          </Button>
        );
      },
    },
    { title: "工号", dataIndex: "employeeJobNo", width: 100 },
    { title: "老师姓名", dataIndex: "employeeName", width: 140 },
    { title: "所属年月", dataIndex: "period", width: 100 },
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

  const rowKey = (r: PayrollRow) =>
    r.kind === "auto"
      ? `auto:${r.employeeJobNo}:${r.period}`
      : `manual:${r.id}`;

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
            value={mode}
            onChange={(e) => applyMode(e.target.value as PayrollRangeMode)}
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: "本月", value: "current" },
              { label: "上月", value: "previous" },
              { label: "自定义", value: "custom" },
            ]}
          />
          {mode === "custom" ? (
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
        <Button type="primary" icon={<PlusOutlined />} onClick={askAddManual}>
          手动添加记录
        </Button>
      </div>

      <Table<PayrollRow>
        rowKey={rowKey}
        dataSource={listQ.data?.items ?? []}
        columns={columns}
        loading={listQ.isLoading}
        scroll={{ x: 1400 }}
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
          onClose={() => setSettleFor(null)}
        />
      ) : null}
      {viewCoursesFor ? (
        <ViewCoursesDialog
          open={Boolean(viewCoursesFor)}
          teacherJobNo={viewCoursesFor.teacherJobNo}
          teacherName={viewCoursesFor.teacherName}
          period={viewCoursesFor.period}
          onClose={() => setViewCoursesFor(null)}
        />
      ) : null}
    </div>
  );
}
