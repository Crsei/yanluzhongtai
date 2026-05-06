import { Empty, Modal, Table } from "antd";
import { useQuery } from "@tanstack/react-query";
import { payrollApi } from "../../services/payroll";
import type { PayrollCourseItem, PayrollTeachingType } from "./types";

type Props = {
  open: boolean;
  teacherJobNo: string;
  teacherName: string;
  period: string;
  teachingType: PayrollTeachingType;
  onClose: () => void;
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

export function ViewCoursesDialog({
  open,
  teacherJobNo,
  teacherName,
  period,
  teachingType,
  onClose,
}: Props) {
  const q = useQuery({
    queryKey: ["payroll", "courses", teacherJobNo, period, teachingType],
    queryFn: () =>
      payrollApi.coursesForTeacherPeriod(teacherJobNo, period, teachingType),
    enabled: open && Boolean(teacherJobNo) && Boolean(period),
  });

  const columns = [
    { title: "课程编号", dataIndex: "courseNo", width: 140 },
    { title: "课程名称", dataIndex: "name" },
    {
      title: "计划时间",
      dataIndex: "plannedAt",
      width: 180,
      render: (v: string | null) => formatDateTime(v),
    },
    {
      title: "课时",
      dataIndex: "creditHours",
      width: 100,
      render: (v: number | null) => (v == null ? "—" : v.toFixed(2)),
    },
    {
      title: "学生数",
      dataIndex: "enrolledStudentCount",
      width: 90,
    },
    {
      title: "授课方式",
      dataIndex: "actualTeachingType",
      width: 110,
      render: (v: string | null) => v ?? "—",
    },
  ];

  return (
    <Modal
      open={open}
      title={`${teacherName} · ${period} · ${teachingType} 课程`}
      width={900}
      footer={null}
      onCancel={onClose}
      destroyOnClose
    >
      <Table<PayrollCourseItem>
        rowKey="id"
        loading={q.isLoading}
        dataSource={q.data ?? []}
        columns={columns}
        pagination={false}
        locale={{ emptyText: <Empty description="当月无已完成课程" /> }}
      />
    </Modal>
  );
}
