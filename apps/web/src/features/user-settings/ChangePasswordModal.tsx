import { Form, Input, Modal, message } from "antd";
import { useEffect } from "react";
import { usersApi } from "../../services/users";

type Props = {
  open: boolean;
  onClose: () => void;
};

type FieldValues = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export function ChangePasswordModal({ open, onClose }: Props) {
  const [form] = Form.useForm<FieldValues>();

  useEffect(() => {
    if (!open) form.resetFields();
  }, [open, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      await usersApi.changeMyPassword({
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      message.success("密码已更新");
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "更新失败");
    }
  };

  return (
    <Modal
      title="修改密码"
      open={open}
      onOk={handleSubmit}
      onCancel={onClose}
      okText="确定"
      cancelText="取消"
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="oldPassword"
          label="当前密码"
          rules={[{ required: true, message: "请输入当前密码" }]}
        >
          <Input.Password placeholder="请输入当前密码" />
        </Form.Item>
        <Form.Item
          name="newPassword"
          label="新密码"
          rules={[
            { required: true, message: "请输入新密码" },
            {
              pattern: /^(?=.*[A-Za-z])(?=.*\d).{8,}$/,
              message: "密码需≥8字符且含字母与数字",
            },
          ]}
        >
          <Input.Password placeholder="≥8 位，含字母与数字" />
        </Form.Item>
        <Form.Item
          name="confirmPassword"
          label="确认新密码"
          dependencies={["newPassword"]}
          rules={[
            { required: true, message: "请再次输入新密码" },
            ({ getFieldValue }) => ({
              validator(_rule, value) {
                if (!value || getFieldValue("newPassword") === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error("两次输入的密码不一致"));
              },
            }),
          ]}
        >
          <Input.Password placeholder="请再次输入新密码" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
