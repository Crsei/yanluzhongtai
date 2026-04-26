// apps/web/src/features/students/StudentFormModal.tsx
import {
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
} from "antd";
import { useEffect, useMemo } from "react";
import { EmployeePicker } from "../../components/EmployeePicker";
import {
  SERVICE_PLATFORM_OPTIONS,
  SERVICE_STATUS_OPTIONS,
  STUDENT_SOURCE_OPTIONS,
} from "../../constants/dictionaries";
import type { StudentDetail } from "../../services/students";
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
    return { serviceStatus: "NOT_STARTED" };
  }
  return {
    ...s,
    detailNotes: Array.isArray(s.detailNotes) ? s.detailNotes : [],
  };
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

  const handleOk = async () => {
    const values = await form.validateFields();
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

  const footer = useMemo(() => {
    if (mode === "view") {
      return [
        <a key="cancel" onClick={onClose} style={{ marginRight: 12 }}>
          取消
        </a>,
        <a key="edit" onClick={() => onModeChange("edit")}>
          编辑
        </a>,
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
      <Form form={form} layout="vertical" disabled={disabled}>
        <SectionTitle>基础档案</SectionTitle>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="学号">
              <Input value={initial?.studentNo ?? "保存后生成"} disabled />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="姓名" name="name" rules={[{ required: true, max: 50 }]}>
              <Input placeholder="请输入学生姓名" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="性别" name="gender" rules={[{ required: true }]}>
              <Select options={[{ value: "男", label: "男" }, { value: "女", label: "女" }]} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="电话" name="phone" rules={[{ pattern: /^1[3-9]\d{9}$/, message: "手机号格式不正确" }]}>
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
              rules={[{ type: "integer", min: 2000, max: 2100 }]}
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
              rules={[{ type: "integer", min: 2000, max: 2100 }]}
            >
              <InputNumber min={2000} max={2100} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="学校" name="school">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="专业" name="major">
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
            <Form.Item label="服务状态" name="serviceStatus" rules={[{ required: true }]}>
              <Select options={SERVICE_STATUS_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="服务平台" name="servicePlatform" rules={[{ required: true }]}>
              <Select options={SERVICE_PLATFORM_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="学生来源" name="source" rules={[{ required: true }]}>
              <Select options={STUDENT_SOURCE_OPTIONS} />
            </Form.Item>
          </Col>
        </Row>

        <SectionTitle>课时</SectionTitle>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="公共课总课时" name="totalPublicCredits">
              <InputNumber min={0} step={0.5} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="公共课剩余" name="remainingPublicCredits">
              <InputNumber min={0} step={0.5} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="1v1 总课时" name="totalPrivateCredits">
              <InputNumber min={0} step={0.5} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="1v1 剩余" name="remainingPrivateCredits">
              <InputNumber min={0} step={0.5} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>

        <SectionTitle>服务字段</SectionTitle>
        <Form.Item label="服务清单链接" name="serviceChecklistUrl">
          <Input placeholder="可选" />
        </Form.Item>
        <Form.Item label="服务清单附件" name="serviceChecklistKeys">
          <StudentAttachmentUpload disabled={disabled} />
        </Form.Item>
        <Form.Item label="总规划链接" name="overallPlanUrl">
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

        <SectionTitle>已上课程的二级课程类别</SectionTitle>
        <div className="related-course-categories-placeholder">
          待课程模块上线后自动同步
        </div>
      </Form>
    </Modal>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="student-detail-section-title">{children}</div>;
}
