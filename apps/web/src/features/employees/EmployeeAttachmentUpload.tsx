// apps/web/src/features/employees/EmployeeAttachmentUpload.tsx
import { UploadOutlined } from "@ant-design/icons";
import { Button, List, Space, Typography, message } from "antd";
import type { UploadProps } from "antd";
import { Upload } from "antd";
import { storageApi, uploadToStorage } from "../../services/storage";

type Props = {
  value?: string[];
  onChange?: (keys: string[]) => void;
  disabled?: boolean;
};

function basenameOf(key: string): string {
  // key form: "employees/attachments/<uuid>-<originalname>"
  const last = key.split("/").pop() ?? key;
  const dashIdx = last.indexOf("-");
  return dashIdx > 0 ? last.slice(dashIdx + 1) : last;
}

export function EmployeeAttachmentUpload({ value = [], onChange, disabled }: Props) {
  const customRequest: UploadProps["customRequest"] = async ({ file, onSuccess, onError }) => {
    try {
      const key = await uploadToStorage("employees/attachments", file as File);
      onChange?.([...value, key]);
      onSuccess?.({ key });
    } catch (err) {
      onError?.(err as Error);
      message.error("上传失败");
    }
  };

  const removeKey = (key: string) => {
    onChange?.(value.filter((k) => k !== key));
  };

  const openDownload = async (key: string) => {
    try {
      const { url } = await storageApi.signDownload(key);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      message.error("无法打开附件");
    }
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Upload disabled={disabled} customRequest={customRequest} showUploadList={false}>
        <Button icon={<UploadOutlined />} disabled={disabled}>
          选择附件
        </Button>
      </Upload>
      <List
        size="small"
        bordered={value.length > 0}
        dataSource={value}
        locale={{ emptyText: "暂无附件" }}
        renderItem={(key) => (
          <List.Item
            actions={
              disabled
                ? []
                : [
                    <Typography.Link key="dl" onClick={() => openDownload(key)}>
                      下载
                    </Typography.Link>,
                    <Typography.Link key="rm" onClick={() => removeKey(key)} type="danger">
                      移除
                    </Typography.Link>,
                  ]
            }
          >
            <Typography.Link onClick={() => openDownload(key)}>{basenameOf(key)}</Typography.Link>
          </List.Item>
        )}
      />
    </Space>
  );
}
