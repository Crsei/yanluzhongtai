import { Form, Input, Modal, Radio, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { ROLE_LABELS, type UserRole } from "../auth/types";
import { useUserMutations } from "./hooks/useUserMutations";

type Props = {
  open: boolean;
  onClose: () => void;
};

type FieldValues = {
  phone: string;
  username: string;
  role: UserRole;
};

export function RegisterUserModal({ open, onClose }: Props) {
  const [form] = Form.useForm<FieldValues>();
  const { register } = useUserMutations();
  const [initialPassword, setInitialPassword] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setInitialPassword(null);
    }
  }, [open, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      const res = await register.mutateAsync(values);
      setInitialPassword(res.initialPassword);
      message.success("账号已创建");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "创建失败");
    }
  };

  return (
    <Modal
      title={initialPassword ? "账号已创建" : "注册账号"}
      open={open}
      onOk={initialPassword ? onClose : handleSubmit}
      onCancel={onClose}
      okText={initialPassword ? "完成" : "确定"}
      cancelText={initialPassword ? undefined : "取消"}
      cancelButtonProps={initialPassword ? { style: { display: "none" } } : undefined}
      destroyOnClose
    >
      {initialPassword ? (
        <>
          <Typography.Paragraph>
            账号创建成功。请将以下初始密码转告用户，用户首次登录时将强制修改密码：
          </Typography.Paragraph>
          <Typography.Paragraph>
            <Typography.Text code copyable style={{ fontSize: 18 }}>
              {initialPassword}
            </Typography.Text>
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary">
            关闭弹窗后将无法再次查看此初始密码；如忘记请使用"重置密码"操作。
          </Typography.Paragraph>
        </>
      ) : (
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          initialValues={{ role: "MEMBER" as UserRole }}
        >
          <Form.Item
            name="phone"
            label="手机号"
            rules={[
              { required: true, message: "请输入手机号" },
              { pattern: /^1[3-9]\d{9}$/, message: "手机号格式不正确" },
            ]}
          >
            <Input placeholder="11 位手机号" maxLength={11} />
          </Form.Item>
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: "请输入用户名" },
              { max: 50, message: "用户名长度不超过 50 字" },
            ]}
          >
            <Input placeholder="请输入用户名" maxLength={50} />
          </Form.Item>
          <Form.Item
            name="role"
            label="账号角色"
            rules={[{ required: true, message: "请选择角色" }]}
          >
            <Radio.Group>
              <Radio value="MEMBER">{ROLE_LABELS.MEMBER}</Radio>
              <Radio value="ADMIN">{ROLE_LABELS.ADMIN}</Radio>
              <Radio value="SUPER_ADMIN">{ROLE_LABELS.SUPER_ADMIN}</Radio>
            </Radio.Group>
          </Form.Item>
          <Typography.Paragraph type="secondary">
            初始密码为手机号后 6 位，用户首次登录时强制修改。
          </Typography.Paragraph>
        </Form>
      )}
    </Modal>
  );
}
