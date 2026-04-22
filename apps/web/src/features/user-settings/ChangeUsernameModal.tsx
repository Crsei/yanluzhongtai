import { Form, Input, Modal, message } from "antd";
import { useEffect } from "react";
import { useAuthStore } from "../../stores/authStore";
import { usersApi } from "../../services/users";

type Props = {
  open: boolean;
  onClose: () => void;
};

type FieldValues = {
  newUsername: string;
};

export function ChangeUsernameModal({ open, onClose }: Props) {
  const [form] = Form.useForm<FieldValues>();
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const accessToken = useAuthStore((s) => s.accessToken);
  const rememberMe = useAuthStore((s) => s.rememberMe);

  useEffect(() => {
    if (!open) form.resetFields();
    else if (user) form.setFieldsValue({ newUsername: user.username });
  }, [open, form, user]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      await usersApi.updateMyUsername({ newUsername: values.newUsername });
      if (user && accessToken) {
        setSession({
          accessToken,
          rememberMe,
          user: { ...user, username: values.newUsername },
        });
      }
      message.success("员工姓名已更新");
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "更新失败");
    }
  };

  return (
    <Modal
      title="修改员工姓名"
      open={open}
      onOk={handleSubmit}
      onCancel={onClose}
      okText="确定"
      cancelText="取消"
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="newUsername"
          label="员工姓名"
          rules={[
            { required: true, message: "请输入员工姓名" },
            { max: 50, message: "姓名长度不超过 50 字" },
          ]}
        >
          <Input placeholder="请输入员工姓名" maxLength={50} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
