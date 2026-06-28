import { Button, Card, Space } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { ChangePhoneModal } from "./ChangePhoneModal";
import { ChangeUsernameModal } from "./ChangeUsernameModal";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { DeactivateSelfModal } from "./DeactivateSelfModal";

export function UserSettingsPage() {
  const navigate = useNavigate();
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
            <Button onClick={() => navigate("/users")}>
              全部用户管理
            </Button>
          </Space>
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
      <ChangePasswordModal
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />
      <DeactivateSelfModal
        open={deactivateOpen}
        onClose={() => setDeactivateOpen(false)}
      />
    </div>
  );
}
