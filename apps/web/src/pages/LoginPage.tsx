import { Button, Card, Checkbox, Form, Input, Space, Typography } from "antd";
import { useNavigate } from "react-router-dom";

export function LoginPage() {
  const navigate = useNavigate();

  return (
    <div className="login-page">
      <Card className="login-card" bordered={false}>
        <div className="login-logo">研录</div>
        <Typography.Title level={1} className="login-title">
          欢迎登录研录教学管理中台
        </Typography.Title>
        <Form layout="vertical" onFinish={() => navigate("/employees")}>
          <Form.Item label="手机号" name="phone">
            <Input size="large" placeholder="请输入手机号" />
          </Form.Item>
          <Form.Item label="密码" name="password">
            <Input.Password size="large" placeholder="请输入密码" />
          </Form.Item>
          <div className="login-meta-row">
            <Checkbox defaultChecked>保留登录状态</Checkbox>
            <Typography.Link>忘记密码？</Typography.Link>
          </div>
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Button type="primary" htmlType="submit" size="large" block>
              登录
            </Button>
            <Button
              size="large"
              block
              onClick={() => window.alert("请联系超级管理员添加账号、密码，或发送邮件到 jupiterlyr@foxmail.com")}
            >
              注册
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}

