import { DownloadOutlined, InboxOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Drawer,
  Space,
  Statistic,
  Table,
  Typography,
  Upload,
  message,
} from "antd";
import type { UploadProps } from "antd";
import { useState } from "react";
import { courseOutlinesApi } from "../../services/course-outlines";
import { uploadToStorage } from "../../services/storage";
import { useOutlineMutations } from "./hooks/useOutlineMutations";
import type { ImportRowError, OutlineImportReport } from "./types";

type Props = {
  open: boolean;
  versionId: string;
  versionName: string;
  onClose: () => void;
};

export function ImportOverwriteDrawer({ open, versionId, versionName, onClose }: Props) {
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [report, setReport] = useState<OutlineImportReport | null>(null);
  const [uploading, setUploading] = useState(false);
  const mutations = useOutlineMutations(versionId);

  const reset = () => {
    setFileKey(null);
    setReport(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const customRequest: UploadProps["customRequest"] = async ({
    file,
    onSuccess,
    onError,
  }) => {
    setUploading(true);
    try {
      const key = await uploadToStorage(
        "course-outlines/import-batches",
        file as File,
      );
      setFileKey(key);
      const dryRun = await courseOutlinesApi.importDryRun(versionId, key);
      setReport(dryRun);
      onSuccess?.({ key });
    } catch (err) {
      onError?.(err as Error);
      message.error("上传或预校验失败");
    } finally {
      setUploading(false);
    }
  };

  const handleCommit = async () => {
    if (!fileKey) return;
    await mutations.importCommit.mutateAsync({ versionId, fileKey });
    handleClose();
  };

  const errorColumns = [
    { title: "行号", dataIndex: "row", key: "row", width: 80 },
    { title: "字段", dataIndex: "field", key: "field", width: 160 },
    { title: "问题", dataIndex: "message", key: "message" },
  ];

  return (
    <Drawer
      title={`导入并覆盖当前大纲(${versionName})`}
      width={720}
      open={open}
      onClose={handleClose}
      destroyOnClose
      extra={
        <Button
          icon={<DownloadOutlined />}
          onClick={() => courseOutlinesApi.downloadTemplate()}
        >
          下载模板
        </Button>
      }
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Alert
          type="warning"
          showIcon
          message={`导入将覆盖当前版本 ${versionName} 的全部板块与条目,版本号不变。原有条目将被永久删除。`}
        />
        <Typography.Paragraph type="secondary">
          1. 下载模板,按列填充板块与条目。
          <br />
          2. 上传后系统会预校验所有行;只有零错误时才允许"确认导入并覆盖"。
          <br />
          3. 计划授课老师工号需对应未离职员工。
        </Typography.Paragraph>

        <Upload.Dragger
          accept=".xlsx"
          multiple={false}
          showUploadList={false}
          customRequest={customRequest}
          disabled={uploading || mutations.importCommit.isPending}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">
            {uploading ? "上传中..." : "点击或拖拽 .xlsx 文件到此处"}
          </p>
        </Upload.Dragger>

        {report ? (
          <>
            <Space size="large">
              <Statistic title="总行数" value={report.totalRows} />
              <Statistic title="有效行" value={report.validRows} />
              <Statistic title="识别板块数" value={report.uniqueSections} />
              <Statistic
                title="错误条数"
                value={report.errors.length}
                valueStyle={{
                  color: report.errors.length > 0 ? "#ff4d4f" : "#52c41a",
                }}
              />
            </Space>
            {report.errors.length > 0 ? (
              <Alert
                type="error"
                showIcon
                message="检测到错误,请修正模板后重新上传"
                description={
                  <Table<ImportRowError>
                    rowKey={(row, idx) => `${row.row}-${row.field}-${idx}`}
                    size="small"
                    pagination={false}
                    columns={errorColumns}
                    dataSource={report.errors}
                    style={{ marginTop: 12 }}
                  />
                }
              />
            ) : (
              <Alert type="success" message="校验通过,可以导入" />
            )}
            <Button
              type="primary"
              danger
              size="large"
              block
              loading={mutations.importCommit.isPending}
              disabled={report.errors.length > 0 || report.validRows === 0}
              onClick={handleCommit}
            >
              确认导入并覆盖
            </Button>
          </>
        ) : null}
      </Space>
    </Drawer>
  );
}
