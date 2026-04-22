import { Alert, Input, Modal, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { usersApi } from "../../services/users";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function DeactivateSelfModal({ open, onClose }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [phoneInput, setPhoneInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setPhoneInput("");
      setSubmitting(false);
    }
  }, [open]);

  if (!user) return null;

  const isPhoneMatch = phoneInput === user.phone;

  const handleConfirm = async () => {
    if (step === 1) {
      setStep(2);
      return;
    }
    if (!isPhoneMatch) return;
    setSubmitting(true);
    try {
      await usersApi.deactivateMe({ phoneConfirmation: phoneInput });
      message.success("账号已注销");
      await logout();
      navigate("/login", { replace: true });
    } catch (err) {
      message.error(err instanceof Error ? err.message : "注销失败");
      setSubmitting(false);
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
        loading: submitting,
      }}
      destroyOnClose
    >
      {step === 1 ? (
        <Alert
          type="warning"
          showIcon
          message={`您确定注销手机号 ${user.phone} 的账号吗？`}
          description="注销后该账号将立即失效，历史审计记录会保留但账号无法恢复。如仅是暂停使用，请联系超级管理员。"
        />
      ) : (
        <>
          <Typography.Paragraph>
            请再次输入您的手机号 <Typography.Text strong>{user.phone}</Typography.Text> 以确认注销：
          </Typography.Paragraph>
          <Input
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value.trim())}
            placeholder="请输入完整手机号"
            maxLength={11}
          />
          {phoneInput && !isPhoneMatch && (
            <Typography.Text type="danger" style={{ display: "block", marginTop: 8 }}>
              手机号与当前账号不一致
            </Typography.Text>
          )}
        </>
      )}
    </Modal>
  );
}
