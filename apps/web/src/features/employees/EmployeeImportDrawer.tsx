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
import { useQueryClient } from "@tanstack/react-query";
import { employeesApi } from "../../services/employees";
import { uploadToStorage } from "../../services/storage";
import type { ImportReport, ImportRowError } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function EmployeeImportDrawer({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const reset = () => {
    setFileKey(null);
    setReport(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const customRequest: UploadProps["customRequest"] = async ({ file, onSuccess, onError }) => {
    setUploading(true);
    try {
      const key = await uploadToStorage("employees/import-batches", file as File);
      setFileKey(key);
      const dryRun = await employeesApi.importDryRun(key);
      setReport(dryRun);
      onSuccess?.({ key });
    } catch (err) {
      onError?.(err as Error);
      message.error(
        err instanceof Error ? err.message : "上传或预校验失败",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleCommit = async () => {
    if (!fileKey) return;
    setSubmitting(true);
    try {
      const result = await employeesApi.importCommit(fileKey);
      message.success(`成功导入 ${result.created} 名员工`);
      qc.invalidateQueries({ queryKey: ["employees"] });
      handleClose();
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : "导入失败，请检查后重试",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const errorColumns = [
    { title: "行号", dataIndex: "row", key: "row", width: 80 },
    { title: "字段", dataIndex: "field", key: "field", width: 160 },
    { title: "问题", dataIndex: "message", key: "message" },
  ];

  return (
    <Drawer
      title="从 Excel 导入员工"
      width={720}
      open={open}
      onClose={handleClose}
      destroyOnClose
      extra={
        <Button
          icon={<DownloadOutlined />}
          onClick={() =>
            employeesApi.downloadTemplate().catch((err) =>
              message.error(err instanceof Error ? err.message : "下载失败"),
            )
          }
        >
          下载模板
        </Button>
      }
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Typography.Paragraph type="secondary">
          1. 下载模板，按列填充员工信息（必填：姓名、性别、雇佣状态、具体工作职责）。
          <br />
          2. 上传后系统会预校验所有行；只有零错误时才允许"确认导入"。
          <br />
          3. 工号会按入职年份自动连续分配，删除不会回收。
        </Typography.Paragraph>

        <Upload.Dragger
          accept=".xlsx"
          multiple={false}
          showUploadList={false}
          customRequest={customRequest}
          disabled={uploading || submitting}
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
              <Statistic
                title="错误条数"
                value={report.errors.length}
                valueStyle={{ color: report.errors.length > 0 ? "#ff4d4f" : "#52c41a" }}
              />
            </Space>

            {report.errors.length > 0 ? (
              <Alert
                type="error"
                showIcon
                message="检测到错误，请修正模板后重新上传"
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
              <Alert type="success" message="校验通过，可以导入" />
            )}

            <Button
              type="primary"
              size="large"
              block
              loading={submitting}
              disabled={report.errors.length > 0 || report.validRows === 0}
              onClick={handleCommit}
            >
              确认导入
            </Button>
          </>
        ) : null}
      </Space>
    </Drawer>
  );
}
