import { PlusOutlined } from "@ant-design/icons";
import {
  Button,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Typography,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { TEACHING_TYPE_OPTIONS } from "../../constants/dictionaries";
import { EmployeePicker } from "../../components/EmployeePicker";
import { useOutlineMutations } from "./hooks/useOutlineMutations";
import type { CourseSection, CreateItemBody } from "./types";

type Props = {
  open: boolean;
  versionId: string;
  sections: CourseSection[];
  onClose: () => void;
};

type InlineSection = { code: string; name: string; displayOrder: number | undefined };

type FormValues = {
  sectionCode: string;
  sequenceNo: number;
  secondaryCategoryName: string;
  suggestedTeachingType: string;
  plannedTeacherJobNo?: string | null;
  lessonPlanUrl?: string;
};

export function AddOutlineItemModal({ open, versionId, sections, onClose }: Props) {
  const [form] = Form.useForm<FormValues>();
  const mutations = useOutlineMutations(versionId);
  const [inline, setInline] = useState<InlineSection | null>(null);
  const [showInlineForm, setShowInlineForm] = useState(false);
  const [inlineDraft, setInlineDraft] = useState<InlineSection>({
    code: "",
    name: "",
    displayOrder: undefined,
  });

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ sequenceNo: 1, suggestedTeachingType: "1v1" });
      setInline(null);
      setShowInlineForm(false);
      setInlineDraft({ code: "", name: "", displayOrder: undefined });
    }
  }, [open, form]);

  const sectionOptions = useMemo(() => {
    const base = sections.map((s) => ({
      value: s.code,
      label: `${s.name} (${s.code})`,
    }));
    if (inline) {
      base.push({
        value: inline.code,
        label: `${inline.name} (${inline.code}) — 新建`,
      });
    }
    return base;
  }, [sections, inline]);

  const saveInline = () => {
    const code = inlineDraft.code.trim().toUpperCase();
    const name = inlineDraft.name.trim();
    if (!/^[A-Z]{2}$/.test(code)) return;
    if (!name) return;
    if (sections.some((s) => s.code === code)) return;
    const next = { code, name, displayOrder: inlineDraft.displayOrder };
    setInline(next);
    setShowInlineForm(false);
    form.setFieldsValue({ sectionCode: code });
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const body: CreateItemBody = {
      sequenceNo: String(values.sequenceNo).padStart(2, "0"),
      secondaryCategoryName: values.secondaryCategoryName.trim(),
      suggestedTeachingType: values.suggestedTeachingType,
      plannedTeacherJobNo: values.plannedTeacherJobNo ?? null,
      lessonPlanUrl: values.lessonPlanUrl?.trim() || null,
    };
    if (inline && values.sectionCode === inline.code) {
      body.newSection = {
        code: inline.code,
        name: inline.name,
        displayOrder: inline.displayOrder,
      };
    } else {
      body.sectionCode = values.sectionCode;
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
          <Col span={24}>
            <Form.Item
              label="板块"
              name="sectionCode"
              rules={[{ required: true, message: "请选择板块" }]}
            >
              <Select
                options={sectionOptions}
                placeholder="选择已有板块或新建"
                dropdownRender={(menu) => (
                  <>
                    {menu}
                    <Divider style={{ margin: "4px 0" }} />
                    <div style={{ padding: "0 8px 8px" }}>
                      <Button
                        type="link"
                        icon={<PlusOutlined />}
                        onClick={() => setShowInlineForm(true)}
                      >
                        + 新建板块
                      </Button>
                    </div>
                  </>
                )}
              />
            </Form.Item>
          </Col>

          {showInlineForm ? (
            <Col span={24}>
              <div style={{ background: "#fafafa", padding: 12, borderRadius: 8 }}>
                <Typography.Text type="secondary">
                  新建板块(随本次条目一起保存)
                </Typography.Text>
                <Row gutter={12} style={{ marginTop: 8 }}>
                  <Col span={8}>
                    <Input
                      placeholder="代码(2 位大写字母)"
                      maxLength={2}
                      value={inlineDraft.code}
                      onChange={(e) =>
                        setInlineDraft((d) => ({
                          ...d,
                          code: e.target.value.toUpperCase(),
                        }))
                      }
                    />
                  </Col>
                  <Col span={10}>
                    <Input
                      placeholder="板块名称"
                      value={inlineDraft.name}
                      onChange={(e) =>
                        setInlineDraft((d) => ({ ...d, name: e.target.value }))
                      }
                    />
                  </Col>
                  <Col span={6}>
                    <InputNumber
                      placeholder="排序"
                      min={0}
                      style={{ width: "100%" }}
                      value={inlineDraft.displayOrder ?? null}
                      onChange={(v) =>
                        setInlineDraft((d) => ({
                          ...d,
                          displayOrder: v ?? undefined,
                        }))
                      }
                    />
                  </Col>
                </Row>
                <Space style={{ marginTop: 8 }}>
                  <Button onClick={() => setShowInlineForm(false)}>取消</Button>
                  <Button type="primary" onClick={saveInline}>
                    保存板块
                  </Button>
                </Space>
              </div>
            </Col>
          ) : null}

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
