import { Button, Card, Checkbox, Form, Input, Modal, Space, Typography, message } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HttpError } from "../services/http";
import { useAuthStore } from "../stores/authStore";

type LoginFormValues = {
  phone: string;
  password: string;
  rememberMe: boolean;
};

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const [submitting, setSubmitting] = useState(false);

  const onFinish = async (values: LoginFormValues) => {
    setSubmitting(true);
    try {
      await login(values);
      navigate("/employees", { replace: true });
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : "登录失败，请稍后重试";
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const showRegisterNotice = () => {
    Modal.info({
      title: "无法自助注册",
      content: "请联系超级管理员添加账号、密码，或发送邮件到 jupiterlyr@foxmail.com",
      okText: "我知道了",
    });
  };

  return (
    <div className="login-page">
      <Card className="login-card" bordered={false}>
        <div className="login-brand">
          <img className="login-logo" src="/assets/logo.png" alt="研录" />
          <Typography.Title level={1} className="login-title">
            欢迎登录研录教学管理中台
          </Typography.Title>
        </div>
        <Form<LoginFormValues>
          layout="vertical"
          initialValues={{ rememberMe: true }}
          onFinish={onFinish}
          requiredMark={false}
        >
          <Form.Item
            label="手机号"
            name="phone"
            rules={[
              { required: true, message: "请输入手机号" },
              { pattern: /^1[3-9]\d{9}$/, message: "手机号格式不正确" },
            ]}
          >
            <Input size="large" placeholder="请输入手机号" autoComplete="username" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true, message: "请输入密码" },
              { min: 6, message: "密码至少 6 位" },
            ]}
          >
            <Input.Password size="large" placeholder="请输入密码" autoComplete="current-password" />
          </Form.Item>
          <div className="login-meta-row">
            <Form.Item name="rememberMe" valuePropName="checked" noStyle>
              <Checkbox>保留登录状态</Checkbox>
            </Form.Item>
            <Typography.Link
              onClick={(e) => {
                e.preventDefault();
                message.info("请联系超级管理员重置密码");
              }}
            >
              忘记密码？
            </Typography.Link>
          </div>
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Button type="primary" htmlType="submit" size="large" block loading={submitting}>
              登录
            </Button>
            <Button size="large" block onClick={showRegisterNotice}>
              注册
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}
