import { MenuFoldOutlined } from "@ant-design/icons";
import { Avatar, Button, Drawer, Grid, Layout, Menu, Space, Tag, Typography } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { navigationItems } from "../config/navigation";

const { Header, Content, Sider } = Layout;

const currentUser = {
  name: "刘老师",
  role: "超级管理员",
  online: true,
};

function NavigationContent() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <>
      <div className="brand-block">
        <div className="brand-logo">研录</div>
        <Typography.Title level={3} className="brand-title">
          研录中台
        </Typography.Title>
      </div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[location.pathname]}
        items={navigationItems.map((item) => ({
          key: item.path,
          icon: item.icon,
          label: item.label,
          onClick: () => navigate(item.path),
        }))}
      />
      <div className="user-panel">
        <Tag color={currentUser.online ? "success" : "error"} className="user-status-tag">
          {currentUser.online ? "在线" : "离线"}
        </Tag>
        <Space align="center" size={12}>
          <Avatar style={{ backgroundColor: "#1d8cff" }}>{currentUser.name.slice(0, 1)}</Avatar>
          <div>
            <div className="user-name">{currentUser.name}</div>
            <div className="user-role">{currentUser.role}</div>
          </div>
        </Space>
      </div>
    </>
  );
}

export function AppShell() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <Layout className="app-layout">
      {isMobile ? (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          bodyStyle={{ padding: 0, background: "#08192f" }}
          width={260}
        >
          <div className="sidebar-inner">
            <NavigationContent />
          </div>
        </Drawer>
      ) : (
        <Sider width={260} className="app-sider">
          <div className="sidebar-inner">
            <NavigationContent />
          </div>
        </Sider>
      )}
      <Layout>
        <Header className="app-header">
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              教学管理中台脚手架
            </Typography.Title>
            <Typography.Text type="secondary">
              当前为第一版工程壳，已对齐 spec 的信息架构和模块边界。
            </Typography.Text>
          </div>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
        {isMobile ? (
          <Button
            type="primary"
            shape="circle"
            size="large"
            className="mobile-menu-trigger"
            icon={<MenuFoldOutlined />}
            onClick={() => setDrawerOpen(true)}
          />
        ) : null}
      </Layout>
    </Layout>
  );
}

