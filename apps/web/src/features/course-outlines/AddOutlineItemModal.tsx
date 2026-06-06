import {
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
} from "antd";
import { useEffect } from "react";
import {
  TEACHING_TYPE_OPTIONS,
} from "../../constants/dictionaries";
import { EmployeePicker } from "../../components/EmployeePicker";
import { useOutlineMutations } from "./hooks/useOutlineMutations";
import type { CourseSection, CreateItemBody } from "./types";

type Props = {
  open: boolean;
  versionId: string;
  sections: CourseSection[];
  onClose: () => void;
};

type FormValues = {
  sectionCode: string;
  sectionName: string;
  sequenceNo: number;
  secondaryCategoryName: string;
  suggestedTeachingType: string;
  plannedTeacherJobNo?: string | null;
  lessonPlanUrl?: string;
};

export function AddOutlineItemModal({ open, versionId, sections, onClose }: Props) {
  const [form] = Form.useForm<FormValues>();
  const mutations = useOutlineMutations(versionId);

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ sequenceNo: 1, suggestedTeachingType: "1v1" });
    }
  }, [open, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const code = values.sectionCode.trim().toUpperCase();
    const name = values.sectionName.trim();
    const body: CreateItemBody = {
      sequenceNo: String(values.sequenceNo).padStart(2, "0"),
      secondaryCategoryName: values.secondaryCategoryName.trim(),
      suggestedTeachingType: values.suggestedTeachingType,
      plannedTeacherJobNo: values.plannedTeacherJobNo ?? null,
      lessonPlanUrl: values.lessonPlanUrl?.trim() || null,
    };
    if (sections.some((s) => s.code === code)) {
      body.sectionCode = code;
    } else {
      body.newSection = { code, name };
    }
    await mutations.addItem.mutateAsync({ versionId, body });
    onClose();
  };

  return (
    <Modal
      title="向大纲添加"
      open={open}
      onCancel={onClose}
      width={720}
      destroyOnClose
      onOk={handleSubmit}
      okText="确定"
      cancelText="取消"
      confirmLoading={mutations.addItem.isPending}
    >
      <Form<FormValues> form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="板块缩写"
              name="sectionCode"
              rules={[
                { required: true, message: "请填写板块缩写" },
                { max: 10, message: "板块缩写不超过 10 个字符" },
              ]}
            >
              <Input placeholder="例: XX" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="板块名称"
              name="sectionName"
              rules={[
                { required: true, message: "请填写板块名称" },
                { max: 50, message: "板块名称不超过 50 个字符" },
              ]}
            >
              <Input placeholder="例: 信息素养" />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              label="序列号"
              name="sequenceNo"
              rules={[{ required: true, message: "请填写序列号" }]}
            >
              <InputNumber min={1} max={99} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="建议授课方式"
              name="suggestedTeachingType"
              rules={[{ required: true }]}
            >
              <Select options={TEACHING_TYPE_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item
              label="二级课程类别名称"
              name="secondaryCategoryName"
              rules={[
                { required: true, message: "请填写二级课程类别名称" },
                { max: 100 },
              ]}
            >
              <Input placeholder="例:微积分一对一" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="计划授课老师" name="plannedTeacherJobNo">
              <EmployeePicker excludeResigned placeholder="搜索员工姓名或工号" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="教案排期链接"
              name="lessonPlanUrl"
              rules={[
                {
                  pattern: /^https?:\/\/.+/i,
                  message: "URL 需以 http(s):// 开头",
                },
              ]}
            >
              <Input placeholder="https://..." />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
