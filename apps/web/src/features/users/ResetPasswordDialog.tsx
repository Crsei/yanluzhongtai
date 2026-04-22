import { Modal, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { useUserMutations } from "./hooks/useUserMutations";
import type { UserListItem } from "./types";

type Props = {
  open: boolean;
  target: UserListItem | null;
  onClose: () => void;
};

export function ResetPasswordDialog({ open, target, onClose }: Props) {
  const { resetPassword } = useUserMutations();
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setTempPassword(null);
  }, [open]);

  if (!target) return null;

  const handleConfirm = async () => {
    try {
      const res = await resetPassword.mutateAsync(target.id);
      setTempPassword(res.tempPassword);
      message.success("密码已重置");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "重置失败");
    }
  };

  return (
    <Modal
      title={tempPassword ? "密码已重置" : "重置密码"}
      open={open}
      onOk={tempPassword ? onClose : handleConfirm}
      onCancel={onClose}
      okText={tempPassword ? "完成" : "确认重置"}
      cancelText={tempPassword ? undefined : "取消"}
      okButtonProps={{ danger: !tempPassword, loading: resetPassword.isPending }}
      cancelButtonProps={tempPassword ? { style: { display: "none" } } : undefined}
      destroyOnClose
    >
      {tempPassword ? (
        <>
          <Typography.Paragraph>
            用户 <Typography.Text strong>{target.username}</Typography.Text>（{target.phone}）的密码已重置。新密码如下：
          </Typography.Paragraph>
          <Typography.Paragraph>
            <Typography.Text code copyable style={{ fontSize: 18 }}>
              {tempPassword}
            </Typography.Text>
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary">
            该密码为此次重置生成的临时密码，用户下次登录时强制修改。关闭后不再展示。
          </Typography.Paragraph>
        </>
      ) : (
        <>
          <Typography.Paragraph>
            您确定重置 <Typography.Text strong>{target.username}</Typography.Text>（{target.phone}）的密码吗？
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary">
            新密码将被设为该用户手机号的后 6 位，用户下次登录时强制修改。此操作将写入审计日志。
          </Typography.Paragraph>
        </>
      )}
    </Modal>
  );
}
