import { Button, DatePicker, Form, Input, Select, Typography } from "antd";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmployeePicker } from "../../components/EmployeePicker";
import {
  COURSE_STATUS_OPTIONS,
  TEACHING_TYPE_OPTIONS,
  type CourseStatus,
  type TeachingType,
} from "../../constants/dictionaries";
import { StudentPickerModal, type PickedStudent } from "./StudentPickerModal";
import { useActiveOutline } from "./hooks/useCoursePickerOptions";
import type { CourseQueryParams } from "./types";

type FormShape = {
  name?: string;
  secondaryCategoryName?: string;
  sectionCode?: string;
  actualTeachingType?: TeachingType;
  actualTeacherJobNo?: string | null;
  status?: CourseStatus;
  plannedAtFrom?: Dayjs | null;
  plannedAtTo?: Dayjs | null;
};

export function AdvancedSearchPage() {
  const navigate = useNavigate();
  const { detailQ } = useActiveOutline();
  const sections = detailQ.data?.sections ?? [];
  const [pickerOpen, setPickerOpen] = useState(false);
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [form] = Form.useForm<FormShape>();

  const onFinish = (values: FormShape) => {
    const params: CourseQueryParams = {
      name: values.name || undefined,
      secondaryCategoryName: values.secondaryCategoryName || undefined,
      sectionCode: values.sectionCode || undefined,
      actualTeachingType: values.actualTeachingType,
      actualTeacherJobNo: values.actualTeacherJobNo || undefined,
      studentId: student?.id,
      status: values.status,
      plannedAtFrom: values.plannedAtFrom
        ? values.plannedAtFrom.toISOString()
        : undefined,
      plannedAtTo: values.plannedAtTo
        ? values.plannedAtTo.toISOString()
        : undefined,
    };
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
    }
    navigate(`/courses/list?${search.toString()}`);
  };

  return (
    <div className="course-advanced-panel">
      <Typography.Title level={2}>课程高级搜索</Typography.Title>
      <Typography.Paragraph type="secondary">
        按条件组合查询,结果将回到课程列表页展示。
      </Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        className="course-advanced-grid"
      >
        <Form.Item label="课程名称" name="name">
          <Input allowClear placeholder="模糊匹配" />
        </Form.Item>
        <Form.Item label="清单内课程名称" name="secondaryCategoryName">
          <Input allowClear placeholder="模糊匹配二级类别名" />
        </Form.Item>
        <Form.Item label="课程所属板块" name="sectionCode">
          <Select
            allowClear
            placeholder="全部"
            options={sections.map((s) => ({
              value: s.code,
              label: `${s.name} (${s.code})`,
            }))}
          />
        </Form.Item>
        <Form.Item label="实际授课方式" name="actualTeachingType">
          <Select
            allowClear
            placeholder="全部"
            options={TEACHING_TYPE_OPTIONS}
          />
        </Form.Item>
        <Form.Item label="上课学生">
          <div style={{ display: "flex", gap: 8 }}>
            <Input
              readOnly
              value={student ? `${student.name} (${student.studentNo})` : ""}
              placeholder="点右侧按钮选择"
            />
            <Button onClick={() => setPickerOpen(true)}>选择学生</Button>
            {student ? (
              <Button onClick={() => setStudent(null)}>清除</Button>
            ) : null}
          </div>
        </Form.Item>
        <Form.Item label="实际授课老师" name="actualTeacherJobNo">
          <EmployeePicker placeholder="选择员工" allowClear />
        </Form.Item>
        <Form.Item label="课程状态" name="status">
          <Select
            allowClear
            placeholder="全部"
            options={COURSE_STATUS_OPTIONS}
          />
        </Form.Item>
        <Form.Item label="计划授课时间起" name="plannedAtFrom">
          <DatePicker showTime style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item label="计划授课时间止" name="plannedAtTo">
          <DatePicker showTime style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item style={{ gridColumn: "span 2" }}>
          <Button
            type="primary"
            htmlType="submit"
            className="course-advanced-submit"
          >
            查询
          </Button>
        </Form.Item>
      </Form>
      <StudentPickerModal
        open={pickerOpen}
        value={student ? [student] : []}
        onClose={() => setPickerOpen(false)}
        onConfirm={(next) => {
          setStudent(next[0] ?? null);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
