import { Alert, Button, Input, Modal, Space, Typography } from "antd";
import { useState } from "react";

type Props = {
  open: boolean;
  versionName: string;
  onClose: () => void;
  onConfirm: () => Promise<unknown> | void;
  loading?: boolean;
};

export function DeleteVersionConfirm({
  open,
  versionName,
  onClose,
  onConfirm,
  loading,
}: Props) {
  const [input, setInput] = useState("");
  const handleClose = () => {
    setInput("");
    onClose();
  };

  return (
    <Modal
      title={<span style={{ color: "#ff4d4f" }}>删除当前大纲 — 高风险操作</span>}
      open={open}
      onCancel={handleClose}
      destroyOnClose
      footer={
        <Space>
          <Button onClick={handleClose} disabled={loading}>
            取消
          </Button>
          <Button
            danger
            type="primary"
            loading={loading}
            disabled={input !== versionName}
            onClick={async () => {
              await onConfirm();
              handleClose();
            }}
          >
            确认删除
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Alert
          type="error"
          showIcon
          message={`即将永久删除版本 ${versionName},此动作不可恢复。`}
          description="该版本下所有板块与条目将一并删除。引用此版本的课程会自动解除版本关联(Phase 4 后生效)。"
        />
        <Typography.Text>请输入版本号以确认:</Typography.Text>
        <Input
          autoFocus
          placeholder={versionName}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </Space>
    </Modal>
  );
}
