import { Modal, Select, Tag, message } from "antd";
import { useAuthStore } from "../../stores/authStore";
import { ROLE_LABELS, type UserRole } from "../auth/types";
import { useUserMutations } from "./hooks/useUserMutations";

type Props = {
  targetId: string;
  targetRole: UserRole;
  targetUsername: string;
  disabled?: boolean;
};

const ROLE_COLOR: Record<UserRole, string> = {
  SUPER_ADMIN: "volcano",
  ADMIN: "geekblue",
  MEMBER: "default",
};

export function RoleDropdown({ targetId, targetRole, targetUsername, disabled }: Props) {
  const viewer = useAuthStore((s) => s.user);
  const { updateRole } = useUserMutations();
  if (!viewer) return null;

  const isSelf = viewer.id === targetId;
  const isViewerAdmin = viewer.role === "ADMIN";
  const isViewerSuperAdmin = viewer.role === "SUPER_ADMIN";

  const allowedOptions = ((): UserRole[] => {
    if (isSelf) return [targetRole];
    if (isViewerAdmin) {
      // ADMIN can only promote MEMBER to ADMIN
      if (targetRole === "MEMBER") return ["MEMBER", "ADMIN"];
      return [targetRole];
    }
    if (isViewerSuperAdmin) return ["MEMBER", "ADMIN", "SUPER_ADMIN"];
    return [targetRole];
  })();

  const readOnly = disabled || isSelf || allowedOptions.length <= 1;

  if (readOnly) {
    return <Tag color={ROLE_COLOR[targetRole]}>{ROLE_LABELS[targetRole]}</Tag>;
  }

  const handleChange = (newRole: UserRole) => {
    if (newRole === targetRole) return;
    Modal.confirm({
      title: `确认将 ${targetUsername} 设为 ${ROLE_LABELS[newRole]}?`,
      content: "角色变更会立即生效并写入审计日志。",
      okText: "确认",
      cancelText: "取消",
      onOk: async () => {
        try {
          await updateRole.mutateAsync({ id: targetId, role: newRole });
          message.success("角色已更新");
        } catch (err) {
          message.error(err instanceof Error ? err.message : "角色更新失败");
        }
      },
    });
  };

  return (
    <Select
      value={targetRole}
      onChange={handleChange}
      style={{ minWidth: 140 }}
      options={allowedOptions.map((role) => ({
        value: role,
        label: ROLE_LABELS[role],
      }))}
    />
  );
}
