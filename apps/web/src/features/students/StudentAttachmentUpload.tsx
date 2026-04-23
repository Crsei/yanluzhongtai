// apps/web/src/features/students/StudentAttachmentUpload.tsx
import { InboxOutlined } from "@ant-design/icons";
import { Upload, message } from "antd";
import { storageApi, uploadToStorage } from "../../services/storage";

interface Props {
  value?: string[];
  onChange?: (keys: string[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
}

export function StudentAttachmentUpload({
  value = [],
  onChange,
  accept,
  multiple = true,
  disabled,
}: Props) {
  const fileList = value.map((key) => ({
    uid: key,
    name: key.split("/").pop() ?? key,
    status: "done" as const,
  }));

  return (
    <Upload.Dragger
      fileList={fileList}
      multiple={multiple}
      disabled={disabled}
      accept={accept}
      customRequest={async ({ file, onSuccess, onError }) => {
        try {
          const key = await uploadToStorage("students/attachments", file as File);
          onChange?.([...value, key]);
          onSuccess?.(null);
        } catch (e) {
          message.error("文件上传失败");
          onError?.(e as Error);
        }
      }}
      onRemove={(file) => {
        onChange?.(value.filter((k) => k !== file.uid));
        return true;
      }}
      onPreview={async (file) => {
        try {
          const { url } = await storageApi.signDownload(file.uid);
          window.open(url, "_blank", "noopener");
        } catch {
          message.error("生成下载链接失败");
        }
      }}
    >
      <p className="ant-upload-drag-icon">
        <InboxOutlined />
      </p>
      <p className="ant-upload-text">点击或拖拽文件到此处上传</p>
      <p className="ant-upload-hint">支持单次或批量上传</p>
    </Upload.Dragger>
  );
}
