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
import { TEACHING_TYPE_OPTIONS } from "../../constants/dictionaries";
import { EmployeePicker } from "../../components/EmployeePicker";
import { useOutlineMutations } from "./hooks/useOutlineMutations";
import type { CourseOutlineItem, CourseSection, UpdateItemBody } from "./types";

type Props = {
  open: boolean;
  versionId: string;
  sections: CourseSection[];
  item: CourseOutlineItem | null;
  onClose: () => void;
};

type FormValues = {
  sectionCode: string;
  sequenceNo?: number | null;
  secondaryCategoryName?: string | null;
  suggestedTeachingType?: string | null;
  plannedTeacherJobNo?: string | null;
  lessonPlanUrl?: string;
};

export function EditOutlineItemModal({
  open,
  versionId,
  sections: _sections,
  item,
  onClose,
}: Props) {
  const [form] = Form.useForm<FormValues>();
  const mutations = useOutlineMutations(versionId);

  useEffect(() => {
    if (open && item) {
      form.setFieldsValue({
        sectionCode: item.sectionCode,
        sequenceNo: item.sequenceNo ? Number(item.sequenceNo) : null,
        secondaryCategoryName: item.secondaryCategoryName ?? undefined,
        suggestedTeachingType: item.suggestedTeachingType ?? undefined,
        plannedTeacherJobNo: item.plannedTeacherJobNo ?? undefined,
        lessonPlanUrl: item.lessonPlanUrl ?? undefined,
      });
    }
  }, [open, item, form]);

  if (!item) return null;



  const handleSubmit = async () => {
    const v = await form.validateFields();
    const body: UpdateItemBody = {
      sectionCode: v.sectionCode,
      sequenceNo: v.sequenceNo == null ? null : String(v.sequenceNo).padStart(2, "0"),
      secondaryCategoryName: v.secondaryCategoryName?.trim() || null,
      suggestedTeachingType: v.suggestedTeachingType ?? null,
      plannedTeacherJobNo: v.plannedTeacherJobNo ?? null,
      lessonPlanUrl: v.lessonPlanUrl?.trim() || null,
    };
    await mutations.updateItem.mutateAsync({ itemId: item.id, body });
    onClose();
  };

  return (
    <Modal
      title="编辑大纲条目"
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      width={720}
      destroyOnClose
      okText="保存"
      cancelText="取消"
      confirmLoading={mutations.updateItem.isPending}
    >
      <Form<FormValues> form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={24}>
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
              <Input />
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
              <Input />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
