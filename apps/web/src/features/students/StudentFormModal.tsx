// apps/web/src/features/students/StudentFormModal.tsx
import {
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Table,
  Tag,
} from "antd";
import type { TableColumnsType } from "antd";
import { useEffect, useMemo } from "react";
import { EmployeePicker } from "../../components/EmployeePicker";
import {
  COURSE_STATUS_COLORS,
  COURSE_STATUS_LABELS,
  type CourseStatus,
  SERVICE_PLATFORM_OPTIONS,
  SERVICE_STATUS_OPTIONS,
  STUDENT_SOURCE_OPTIONS,
} from "../../constants/dictionaries";
import type { StudentCompletedCourse, StudentDetail } from "../../services/students";
import { DetailNotesEditor } from "./DetailNotesEditor";
import { StudentAttachmentUpload } from "./StudentAttachmentUpload";
import { useStudentMutations } from "./hooks/useStudentMutations";

export type StudentFormMode = "create" | "view" | "edit";

interface Props {
  open: boolean;
  mode: StudentFormMode;
  initial: StudentDetail | null;
  onClose: () => void;
  onModeChange: (m: StudentFormMode) => void;
}

type FormValues = Record<string, unknown>;

function toFormValues(s: StudentDetail | null): FormValues {
  if (!s) {
    return {};
  }
  return {
    ...s,
    detailNotes: Array.isArray(s.detailNotes) ? s.detailNotes : [],
  };
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

function linkExtra(url?: string | null) {
  return url ? (
    <a href={url} target="_blank" rel="noreferrer">
      打开链接
    </a>
  ) : null;
}

export function StudentFormModal({ open, mode, initial, onClose, onModeChange }: Props) {
  const [form] = Form.useForm<FormValues>();
  const { createMutation, updateMutation } = useStudentMutations();

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue(toFormValues(initial) as Record<string, never>);
    }
  }, [open, initial, form]);

  const disabled = mode === "view";
  const serviceChecklistUrl = Form.useWatch("serviceChecklistUrl", form) as
    | string
    | null
    | undefined;
  const overallPlanUrl = Form.useWatch("overallPlanUrl", form) as
    | string
    | null
    | undefined;

  const handleOk = async () => {
    const values = await form.validateFields();
    if (Array.isArray(values.detailNotes) && values.detailNotes.length === 0) {
      delete values.detailNotes;
    }
    if (mode === "create") {
      await createMutation.mutateAsync(values as never);
    } else if (mode === "edit" && initial) {
      const { enrollmentYear: _ignored, ...body } = values;
      await updateMutation.mutateAsync({ id: initial.id, body: body as never });
    }
    onClose();
  };

  const title =
    mode === "create" ? "添加学生" : mode === "edit" ? "编辑学生" : "查看学生";

  const completedCourseColumns: TableColumnsType<StudentCompletedCourse> = [
    { title: "课程名称", dataIndex: "name", width: 180, render: (v: string | null) => v ?? "—" },
    {
      title: "所属二级课程类别",
      dataIndex: "secondaryCategoryName",
      width: 180,
      render: (v: string | null) => v ?? "—",
    },
    {
      title: "计划授课时间",
      dataIndex: "plannedAt",
      width: 180,
      render: (v: string | null) => formatDateTime(v),
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
      width: 130,
      render: (v: string | null) => v ?? "—",
    },
    {
      title: "实际授课老师",
      dataIndex: "actualTeacher",
      width: 150,
      render: (v: StudentCompletedCourse["actualTeacher"]) =>
        v ? `${v.name ?? "未命名"} (${v.jobNo})` : "—",
    },
    {
      title: "授课课时",
      dataIndex: "creditHours",
      width: 110,
      render: (v: number | null) => (v == null ? "—" : v.toFixed(2)),
    },
  ];

  const footer = useMemo(() => {
    if (mode === "view") {
      return [
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="edit" type="primary" onClick={() => onModeChange("edit")}>
          编辑
        </Button>,
      ];
    }
    return undefined; // default [Cancel, OK]
  }, [mode, onClose, onModeChange]);

  return (
    <Modal
      open={open}
      title={title}
      width={1040}
      onCancel={onClose}
      onOk={handleOk}
      okText="确定"
      cancelText="取消"
      footer={mode === "view" ? footer : undefined}
      confirmLoading={createMutation.isPending || updateMutation.isPending}
      styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        disabled={disabled}
        requiredMark={!disabled}
      >
        <SectionTitle>基础档案</SectionTitle>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="学号">
              <Input value={initial?.studentNo ?? "保存后生成"} disabled />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="学生姓名"
              name="name"
              rules={[
                { required: true, message: "请输入学生姓名" },
                { max: 50 },
              ]}
            >
              <Input placeholder="请输入学生姓名" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="性别"
              name="gender"
              rules={[{ required: true, message: "请选择性别" }]}
            >
              <Select options={[{ value: "男", label: "男" }, { value: "女", label: "女" }]} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="电话号码" name="phone" rules={[{ pattern: /^1[3-9]\d{9}$/, message: "手机号格式不正确" }]}>
              <Input placeholder="11 位手机号" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="邮箱" name="email" rules={[{ type: "email" }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="当前年级">
              <Input value={initial?.grade ?? (mode === "create" ? "保存后自动计算" : "-")} disabled />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="入学年份"
              name="enrollmentYear"
              required={mode === "create"}
              rules={[
                ...(mode === "create"
                  ? [{ required: true, message: "请输入入学年份" }]
                  : []),
                {
                  type: "integer",
                  min: 2000,
                  max: 2100,
                  message: "入学年份需为 2000-2100 之间的整数",
                },
              ]}
              tooltip={mode !== "create" ? "入学年份创建后不可修改，如需修正请删除后重建" : undefined}
            >
              <InputNumber
                min={2000}
                max={2100}
                style={{ width: "100%" }}
                disabled={mode !== "create"}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="毕业年份"
              name="graduationYear"
              rules={[
                { required: true, message: "请输入毕业年份" },
                {
                  type: "integer",
                  min: 2000,
                  max: 2100,
                  message: "毕业年份需为 2000-2100 之间的整数",
                },
              ]}
            >
              <InputNumber min={2000} max={2100} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="所在院校" name="school">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="所在专业" name="major">
              <Input />
            </Form.Item>
          </Col>
        </Row>

        <SectionTitle>服务归属</SectionTitle>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="学管老师" name="counselorJobNo">
              <EmployeePicker disabled={disabled} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="规划师" name="plannerJobNo">
              <EmployeePicker disabled={disabled} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="服务状态" name="serviceStatus">
              <Select options={SERVICE_STATUS_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="服务群所在平台" name="servicePlatform">
              <Select options={SERVICE_PLATFORM_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="学生来源" name="source">
              <Select options={STUDENT_SOURCE_OPTIONS} />
            </Form.Item>
          </Col>
        </Row>

        <SectionTitle>课时</SectionTitle>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="GPA+外语+竞赛总课时" name="totalPublicCredits">
              <InputNumber min={0} step={0.5} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="GPA+外语+竞赛剩余课时" name="remainingPublicCredits">
              <InputNumber min={0} step={0.5} style={{ width: "100%" }} disabled />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="1v1 总课时" name="totalPrivateCredits">
              <InputNumber min={0} step={0.5} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="1v1 剩余" name="remainingPrivateCredits">
              <InputNumber min={0} step={0.5} style={{ width: "100%" }} disabled />
            </Form.Item>
          </Col>
        </Row>

        <SectionTitle>服务字段</SectionTitle>
        <Form.Item
          label="服务清单链接"
          name="serviceChecklistUrl"
          extra={linkExtra(serviceChecklistUrl)}
        >
          <Input placeholder="可选" />
        </Form.Item>
        <Form.Item label="服务清单附件" name="serviceChecklistKeys">
          <StudentAttachmentUpload disabled={disabled} />
        </Form.Item>
        <Form.Item
          label="总规划链接"
          name="overallPlanUrl"
          extra={linkExtra(overallPlanUrl)}
        >
          <Input />
        </Form.Item>
        <Form.Item label="总规划说明" name="overallPlanText">
          <Input.TextArea rows={4} />
        </Form.Item>
        <Form.Item label="加分政策附件" name="policyKeys">
          <StudentAttachmentUpload disabled={disabled} />
        </Form.Item>
        <Form.Item label="加分政策说明" name="policyText">
          <Input.TextArea rows={4} />
        </Form.Item>
        <Form.Item label="本学期课表" name="scheduleKeys">
          <StudentAttachmentUpload disabled={disabled} />
        </Form.Item>
        <Form.Item label="成绩单" name="transcriptKeys">
          <StudentAttachmentUpload disabled={disabled} />
        </Form.Item>
        <Form.Item label="通用附件 / 图片" name="attachmentKeys">
          <StudentAttachmentUpload disabled={disabled} />
        </Form.Item>
        <Form.Item label="各类服务项详情" name="detailNotes">
          <DetailNotesEditor disabled={disabled} />
        </Form.Item>
        <Form.Item label="备注" name="note">
          <Input.TextArea rows={3} />
        </Form.Item>

        <SectionTitle>已上课程</SectionTitle>
        <Table<StudentCompletedCourse>
          rowKey="id"
          size="small"
          dataSource={initial?.completedCourses ?? []}
          columns={completedCourseColumns}
          pagination={false}
          scroll={{ x: 1040, y: 260 }}
          locale={{ emptyText: "暂无已上课程" }}
        />
      </Form>
    </Modal>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="student-detail-section-title">{children}</div>;
}
