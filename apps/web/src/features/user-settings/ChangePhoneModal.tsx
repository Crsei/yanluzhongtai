import { Form, Input, Modal, message } from "antd";
import { useEffect } from "react";
import { useAuthStore } from "../../stores/authStore";
import { usersApi } from "../../services/users";

type Props = {
  open: boolean;
  onClose: () => void;
};

type FieldValues = {
  newPhone: string;
  currentPassword: string;
};

export function ChangePhoneModal({ open, onClose }: Props) {
  const [form] = Form.useForm<FieldValues>();
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const accessToken = useAuthStore((s) => s.accessToken);
  const rememberMe = useAuthStore((s) => s.rememberMe);

  useEffect(() => {
    if (!open) form.resetFields();
  }, [open, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      await usersApi.updateMyPhone({
        newPhone: values.newPhone,
        currentPassword: values.currentPassword,
      });
      if (user && accessToken) {
        setSession({
          accessToken,
          rememberMe,
          user: { ...user, phone: values.newPhone },
        });
      }
      message.success("手机号已更新");
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "更新失败");
    }
  };

  return (
    <Modal
      title="修改手机号"
      open={open}
      onOk={handleSubmit}
      onCancel={onClose}
      okText="确定"
      cancelText="取消"
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="newPhone"
          label="新手机号"
          rules={[
            { required: true, message: "请输入手机号" },
            {
              pattern: /^1[3-9]\d{9}$/,
              message: "手机号格式不正确",
            },
          ]}
        >
          <Input placeholder="请输入新的手机号" maxLength={11} />
        </Form.Item>
        <Form.Item
          name="currentPassword"
          label="当前密码"
          rules={[{ required: true, message: "请输入当前密码以确认身份" }]}
        >
          <Input.Password placeholder="请输入当前密码" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
