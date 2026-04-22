import { Alert, Input, Modal, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { useUserMutations } from "./hooks/useUserMutations";
import type { UserListItem } from "./types";

type Props = {
  open: boolean;
  target: UserListItem | null;
  onClose: () => void;
};

export function DeactivateUserModal({ open, target, onClose }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [phoneInput, setPhoneInput] = useState("");
  const { deactivate } = useUserMutations();

  useEffect(() => {
    if (!open) {
      setStep(1);
      setPhoneInput("");
    }
  }, [open]);

  if (!target) return null;

  const isPhoneMatch = phoneInput === target.phone;

  const handleConfirm = async () => {
    if (step === 1) {
      setStep(2);
      return;
    }
    if (!isPhoneMatch) return;
    try {
      await deactivate.mutateAsync({
        id: target.id,
        phoneConfirmation: phoneInput,
      });
      message.success("账号已注销");
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "注销失败");
    }
  };

  return (
    <Modal
      title="注销账号"
      open={open}
      onOk={handleConfirm}
      onCancel={onClose}
      okText={step === 1 ? "继续" : "确认注销"}
      cancelText="取消"
      okButtonProps={{
        danger: true,
        disabled: step === 2 && !isPhoneMatch,
        loading: deactivate.isPending,
      }}
      destroyOnClose
    >
      {step === 1 ? (
        <Alert
          type="warning"
          showIcon
          message={`您确定注销 ${target.phone}（${target.username}）的账号吗？`}
          description="注销后该账号将立即失效。历史审计记录会保留，但账号本身无法在界面上恢复。"
        />
      ) : (
        <>
          <Typography.Paragraph>
            请再次输入目标手机号 <Typography.Text strong>{target.phone}</Typography.Text> 以确认注销：
          </Typography.Paragraph>
          <Input
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value.trim())}
            placeholder="请输入完整手机号"
            maxLength={11}
          />
          {phoneInput && !isPhoneMatch && (
            <Typography.Text type="danger" style={{ display: "block", marginTop: 8 }}>
              手机号与目标账号不一致
            </Typography.Text>
          )}
        </>
      )}
    </Modal>
  );
}
