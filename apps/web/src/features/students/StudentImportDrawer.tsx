// apps/web/src/features/students/StudentImportDrawer.tsx
import { DownloadOutlined, InboxOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Drawer,
  Space,
  Statistic,
  Table,
  Upload,
  message,
} from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { studentsApi, type ImportReport } from "../../services/students";
import { uploadToStorage } from "../../services/storage";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function StudentImportDrawer({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setFileKey(null);
    setReport(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleTemplate = async () => {
    try {
      await studentsApi.downloadTemplate();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "模板下载失败");
    }
  };

  const handleUpload = async (file: File) => {
    setLoading(true);
    try {
      const key = await uploadToStorage("students/import-batches", file);
      setFileKey(key);
      const r = await studentsApi.importDryRun(key);
      setReport(r);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "文件解析失败");
      reset();
    } finally {
      setLoading(false);
    }
    return false; // prevent AntD default upload
  };

  const handleCommit = async () => {
    if (!fileKey) return;
    setLoading(true);
    try {
      const result = await studentsApi.importCommit(fileKey);
      if (result.errors.length === 0) {
        message.success(`成功导入 ${result.created} 名学生`);
        qc.invalidateQueries({ queryKey: ["students"] });
        handleClose();
      } else {
        setReport((prev) =>
          prev
            ? { ...prev, errors: result.errors, validRows: 0 }
            : { totalRows: 0, validRows: 0, errors: result.errors },
        );
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : "导入失败");
    } finally {
      setLoading(false);
    }
  };

  const canCommit = !!report && report.errors.length === 0 && report.validRows > 0;

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title="从 Excel 导入学生"
      width={720}
      footer={
        <Space>
          <Button onClick={handleClose}>取消</Button>
          <Button type="primary" onClick={handleCommit} disabled={!canCommit} loading={loading}>
            确认导入
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Button icon={<DownloadOutlined />} onClick={handleTemplate}>
          下载导入模板
        </Button>
        <Upload.Dragger
          beforeUpload={(file) => handleUpload(file)}
          accept=".xlsx"
          showUploadList={false}
          disabled={loading}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽 .xlsx 文件上传</p>
          <p className="ant-upload-hint">上传后自动预校验</p>
        </Upload.Dragger>

        {report && (
          <>
            <Space size="large">
              <Statistic title="总行数" value={report.totalRows} />
              <Statistic title="有效行" value={report.validRows} />
              <Statistic title="错误行" value={report.errors.length} />
            </Space>
            {report.errors.length > 0 && (
              <Alert
                type="error"
                message="发现错误，请修正后重新上传"
                showIcon
              />
            )}
            <Table
              size="small"
              rowKey={(r) => `${r.row}-${r.field}`}
              dataSource={report.errors}
              pagination={{ pageSize: 10 }}
              columns={[
                { title: "行号", dataIndex: "row", width: 80 },
                { title: "字段", dataIndex: "field", width: 140 },
                { title: "错误信息", dataIndex: "message" },
              ]}
            />
          </>
        )}
      </Space>
    </Drawer>
  );
}
