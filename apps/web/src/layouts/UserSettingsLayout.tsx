import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, Layout, Typography } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const { Header, Content } = Layout;

export function UserSettingsLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const onUsersPage = location.pathname === "/users";

  return (
    <Layout className="user-settings-shell">
      <Header className="user-settings-header">
        <Typography.Title level={3} style={{ margin: 0 }}>
          {onUsersPage ? "全部用户管理" : "用户设置"}
        </Typography.Title>
        {onUsersPage && (
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/user-settings")}
          >
            返回设置
          </Button>
        )}
      </Header>
      <Content className="user-settings-content">
        <Outlet />
      </Content>
    </Layout>
  );
}
