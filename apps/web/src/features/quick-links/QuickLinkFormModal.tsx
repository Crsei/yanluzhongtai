import { Form, Input, Modal, Select } from "antd";
import { useEffect } from "react";
import { useQuickLinkMutations } from "./hooks/useQuickLinkMutations";
import type {
  QuickLinkKind,
  QuickLinkPageType,
  QuickLinkRow,
} from "./types";

type Mode =
  | { mode: "create"; pageType: QuickLinkPageType; knownCategories: string[] }
  | { mode: "edit"; initial: QuickLinkRow; knownCategories: string[] };

type Props = Mode & {
  open: boolean;
  onClose: () => void;
};

type FormValues = {
  category: string | string[];
  kind: QuickLinkKind;
  title: string;
  url: string;
};

const KIND_OPTIONS: Array<{ value: QuickLinkKind; label: string }> = [
  { value: "NAVIGATE", label: "跳转（新标签页打开）" },
  { value: "COPY", label: "复制到剪贴板" },
  { value: "DOWNLOAD", label: "下载文件" },
];

export function QuickLinkFormModal(props: Props) {
  const { open, onClose } = props;
  const [form] = Form.useForm<FormValues>();
  const { create, update } = useQuickLinkMutations();
  const loading = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    if (props.mode === "edit") {
      form.setFieldsValue({
        category: [props.initial.category],
        kind: props.initial.kind,
        title: props.initial.title,
        url: props.initial.url,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ kind: "NAVIGATE", category: [] });
    }
  }, [open, props, form]);

  const handleOk = async () => {
    const raw = await form.validateFields();
    const categoryString = Array.isArray(raw.category)
      ? (raw.category[0] ?? "")
      : raw.category;
    const trimmed = categoryString.trim();
    if (!trimmed) {
      form.setFields([{ name: "category", errors: ["请填写分组名称"] }]);
      return;
    }
    if (props.mode === "create") {
      await create.mutateAsync({
        pageType: props.pageType,
        category: trimmed,
        kind: raw.kind,
        title: raw.title,
        url: raw.url,
      });
    } else {
      await update.mutateAsync({
        id: props.initial.id,
        body: {
          category: trimmed,
          kind: raw.kind,
          title: raw.title,
          url: raw.url,
        },
      });
    }
    onClose();
  };

  const categoryOptions = Array.from(new Set(props.knownCategories)).map(
    (c) => ({ value: c, label: c }),
  );

  return (
    <Modal
      open={open}
      title={props.mode === "create" ? "添加快捷入口" : "编辑快捷入口"}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={loading}
      okText="保存"
      cancelText="取消"
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="category"
          label="分组"
          rules={[{ required: true, message: "请填写分组名称" }]}
        >
          <Select
            mode="tags"
            placeholder="例：企业内部数据表"
            options={categoryOptions}
            maxTagCount={1}
          />
        </Form.Item>
        <Form.Item name="kind" label="类型" rules={[{ required: true }]}>
          <Select options={KIND_OPTIONS} />
        </Form.Item>
        <Form.Item
          name="title"
          label="标题"
          rules={[{ required: true, message: "请填写标题" }]}
        >
          <Input placeholder="可包含 emoji，如 🎓 研录学生调研" />
        </Form.Item>
        <Form.Item
          name="url"
          label="URL / 路径"
          rules={[{ required: true, message: "请填写 URL 或下载路径" }]}
        >
          <Input placeholder="https://... 或 /templates/import.rar" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
