import { Button, Card, Space, Typography } from "antd";
import { useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import { ChangePhoneModal } from "./ChangePhoneModal";
import { ChangeUsernameModal } from "./ChangeUsernameModal";

export function UserSettingsPage() {
  const user = useAuthStore((s) => s.user);
  const [changePhoneOpen, setChangePhoneOpen] = useState(false);
  const [changeUsernameOpen, setChangeUsernameOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  if (!user) return null;

  const isSuperAdmin = user.role === "SUPER_ADMIN";
  const isAdmin = user.role === "ADMIN";
  const showPermissionZone = isSuperAdmin || isAdmin;

  return (
    <div className="user-settings-page">
      <Card style={{ marginBottom: 16 }}>
        <div className="settings-row">
          <div>
            <div className="settings-row-title">绑定手机号</div>
            <div className="settings-row-value">{user.phone}</div>
          </div>
          <Button onClick={() => setChangePhoneOpen(true)}>修改</Button>
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div className="settings-row">
          <div>
            <div className="settings-row-title">员工姓名</div>
            <div className="settings-row-value">{user.username}</div>
          </div>
          <Button onClick={() => setChangeUsernameOpen(true)}>修改</Button>
        </div>
      </Card>

      <Card title="账号安全" style={{ marginBottom: 16 }}>
        <Space>
          <Button onClick={() => setChangePasswordOpen(true)}>修改密码</Button>
          <Button danger onClick={() => setDeactivateOpen(true)}>
            注销账号
          </Button>
        </Space>
      </Card>

      {showPermissionZone && (
        <Card title="权限区">
          <Space wrap>
            <Button onClick={() => window.open("/users", "_blank", "noopener")}>
              设置管理员
            </Button>
            {isSuperAdmin && (
              <>
                <Button
                  onClick={() => window.open("/users", "_blank", "noopener")}
                >
                  设置超级管理员
                </Button>
                <Button
                  onClick={() => window.open("/users", "_blank", "noopener")}
                >
                  中台全部用户管理
                </Button>
              </>
            )}
          </Space>
          <Typography.Paragraph
            type="secondary"
            style={{ marginTop: 12, marginBottom: 0 }}
          >
            点击上方按钮将在新标签页打开"全部用户管理"页面。
          </Typography.Paragraph>
        </Card>
      )}

      <ChangePhoneModal
        open={changePhoneOpen}
        onClose={() => setChangePhoneOpen(false)}
      />
      <ChangeUsernameModal
        open={changeUsernameOpen}
        onClose={() => setChangeUsernameOpen(false)}
      />
      {changePasswordOpen && <div data-testid="change-password-placeholder" />}
      {deactivateOpen && <div data-testid="deactivate-self-placeholder" />}
    </div>
  );
}
