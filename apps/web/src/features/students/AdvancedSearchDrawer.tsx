// apps/web/src/features/students/AdvancedSearchDrawer.tsx
import { Button, Drawer, Form, Input, Select, Space } from "antd";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  GRADE_OPTIONS,
  SERVICE_PLATFORM_OPTIONS,
  STUDENT_SOURCE_OPTIONS,
} from "../../constants/dictionaries";

interface Props {
  open: boolean;
  onClose: () => void;
}

const FIELDS = [
  "studentNo",
  "name",
  "grade",
  "major",
  "source",
  "servicePlatform",
] as const;

type FieldKey = (typeof FIELDS)[number];
type Values = Partial<Record<FieldKey, string>>;

export function AdvancedSearchDrawer({ open, onClose }: Props) {
  const [params, setParams] = useSearchParams();
  const [form] = Form.useForm<Values>();

  useEffect(() => {
    if (!open) return;
    const initial: Values = {};
    for (const k of FIELDS) {
      const v = params.get(k);
      if (v) initial[k] = v;
    }
    form.resetFields();
    form.setFieldsValue(initial);
  }, [open, params, form]);

  const handleConfirm = async () => {
    const values = await form.validateFields();
    const next = new URLSearchParams(params);
    for (const k of FIELDS) {
      const v = values[k];
      if (v && v.length > 0) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page"); // reset pagination on filter change
    setParams(next);
    onClose();
  };

  const handleReset = () => {
    const next = new URLSearchParams(params);
    for (const k of FIELDS) next.delete(k);
    setParams(next);
    form.resetFields();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="高级搜索"
      width={420}
      footer={
        <Space style={{ width: "100%", justifyContent: "flex-end" }}>
          <Button onClick={handleReset}>重置</Button>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handleConfirm}>
            确定
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item label="学号" name="studentNo">
          <Input allowClear />
        </Form.Item>
        <Form.Item label="姓名" name="name">
          <Input allowClear />
        </Form.Item>
        <Form.Item label="年级" name="grade">
          <Select allowClear options={GRADE_OPTIONS} />
        </Form.Item>
        <Form.Item label="专业" name="major">
          <Input allowClear />
        </Form.Item>
        <Form.Item label="学生来源" name="source">
          <Select allowClear options={STUDENT_SOURCE_OPTIONS} />
        </Form.Item>
        <Form.Item label="服务群所在平台" name="servicePlatform">
          <Select allowClear options={SERVICE_PLATFORM_OPTIONS} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}

export const ADVANCED_SEARCH_FIELDS = FIELDS;
