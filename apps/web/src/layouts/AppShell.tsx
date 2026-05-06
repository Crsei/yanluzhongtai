import { MenuFoldOutlined } from "@ant-design/icons";
import {
  Avatar,
  Button,
  Drawer,
  Grid,
  Layout,
  Menu,
  Popover,
  Space,
  Tag,
  Typography,
} from "antd";
import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ABOUT_CONFIG } from "../constants/about";
import { navigationItems } from "../config/navigation";
import { ROLE_LABELS } from "../features/auth/types";
import { useAuthStore } from "../stores/authStore";

const { Header, Content, Sider } = Layout;

function UserPanelAuthenticated() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user)!;
  const logout = useAuthStore((state) => state.logout);
  const roleLabel = ROLE_LABELS[user.role];

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const popoverContent = (
    <div className="user-popover">
      <div className="user-popover-identity">身份：{roleLabel}</div>
      <div className="user-popover-actions">
        <Button
          type="text"
          block
          onClick={() => window.open("/user-settings", "_blank", "noopener")}
        >
          用户设置
        </Button>
        <Button type="text" danger block onClick={handleLogout}>
          退出登录
        </Button>
      </div>
    </div>
  );

  return (
    <div className="user-panel">
      <Tag color="success" className="user-status-tag">
        在线
      </Tag>
      <Popover content={popoverContent} placement="topRight" trigger={["hover", "click"]}>
        <Space align="center" size={12} className="user-panel-trigger">
          <Avatar style={{ backgroundColor: "#1d8cff" }}>{user.username.slice(0, 1)}</Avatar>
          <div>
            <div className="user-name">
              <span className="user-status-dot user-status-dot-online" />
              {user.username}
            </div>
            <div className="user-role">{roleLabel}</div>
          </div>
        </Space>
      </Popover>
    </div>
  );
}

function UserPanelGuest() {
  const navigate = useNavigate();
  return (
    <button type="button" className="user-panel user-panel-guest" onClick={() => navigate("/login")}>
      <span className="user-status-dot user-status-dot-offline" />
      <span className="user-panel-guest-text">访客（点击登录）</span>
    </button>
  );
}

function NavigationContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

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
      {user ? <UserPanelAuthenticated /> : <UserPanelGuest />}
    </>
  );
}

export function AppShell() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;
  const [drawerOpen, setDrawerOpen] = useState(false);

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
          <Typography.Title level={4} style={{ margin: 0 }}>
            {ABOUT_CONFIG.platformName}
          </Typography.Title>
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
