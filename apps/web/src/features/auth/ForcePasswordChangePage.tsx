import { Alert, Button, Card, Form, Input, Typography, message } from "antd";
import { useNavigate } from "react-router-dom";
import { usersApi } from "../../services/users";
import { useAuthStore } from "../../stores/authStore";

type FieldValues = {
  newPassword: string;
  confirmPassword: string;
};

export function ForcePasswordChangePage() {
  const [form] = Form.useForm<FieldValues>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const rememberMe = useAuthStore((s) => s.rememberMe);
  const setSession = useAuthStore((s) => s.setSession);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      await usersApi.initialChangeMyPassword({ newPassword: values.newPassword });
      if (user && accessToken) {
        setSession({
          accessToken,
          rememberMe,
          user: { ...user, mustChangePassword: false },
        });
      }
      message.success("密码已设置，欢迎使用");
      navigate("/", { replace: true });
    } catch (err) {
      message.error(err instanceof Error ? err.message : "设置失败");
    }
  };

  return (
    <div className="force-password-page">
      <Card style={{ maxWidth: 480, width: "100%" }}>
        <Typography.Title level={3} style={{ marginTop: 0 }}>
          设置新密码
        </Typography.Title>
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="您的密码刚被重置或初始化"
          description="请设置一个新的登录密码后继续使用系统。新密码需 ≥8 字符并同时包含字母与数字。"
        />
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
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
          <Button type="primary" htmlType="submit" block>
            确认并继续
          </Button>
        </Form>
      </Card>
    </div>
  );
}
