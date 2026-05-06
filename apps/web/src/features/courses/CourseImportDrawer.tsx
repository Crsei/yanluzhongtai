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
import { coursesApi } from "../../services/courses";
import { uploadToStorage } from "../../services/storage";
import { useCourseMutations } from "./hooks/useCourseMutations";
import type { CourseImportReport } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CourseImportDrawer({ open, onClose }: Props) {
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [report, setReport] = useState<CourseImportReport | null>(null);
  const [uploading, setUploading] = useState(false);
  const { importCommit } = useCourseMutations();

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
        "courses/import-batches",
        file as File,
      );
      setFileKey(key);
      const dryRun = await coursesApi.importDryRun(key);
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
    const r = await importCommit.mutateAsync(fileKey);
    if (r.errors.length === 0) {
      message.success(`已导入 ${r.created} 门课程`);
      handleClose();
    } else {
      setReport({
        totalRows: report?.totalRows ?? 0,
        validRows: r.created,
        errors: r.errors,
      });
      message.error(`导入部分失败,共 ${r.errors.length} 行错误`);
    }
  };

  const errorColumns = [
    { title: "行号", dataIndex: "row", key: "row", width: 80 },
    { title: "字段", dataIndex: "field", key: "field", width: 160 },
    { title: "问题", dataIndex: "message", key: "message" },
  ];

  return (
    <Drawer
      title="从 Excel 导入课程"
      width={720}
      open={open}
      onClose={handleClose}
      destroyOnClose
      extra={
        <Button
          icon={<DownloadOutlined />}
          onClick={() =>
            coursesApi.downloadTemplate().catch((err) =>
              message.error(err instanceof Error ? err.message : "下载失败"),
            )
          }
        >
          下载模板
        </Button>
      }
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Alert
          type="info"
          showIcon
          message="导入会按激活大纲的板块 + 类别匹配,并为每行分配新课程编号。"
        />
        <Typography.Paragraph type="secondary">
          1. 下载模板,填写板块代码、类别序号、课程名称等字段。
          <br />
          2. 上传后系统会预校验所有行;零错误才能点击"确认导入"。
          <br />
          3. 实际授课老师工号必须是未离职员工;选课学号使用分号 <code>;</code> 分隔多个学号。
        </Typography.Paragraph>

        <Upload.Dragger
          accept=".xlsx"
          multiple={false}
          showUploadList={false}
          customRequest={customRequest}
          disabled={uploading || importCommit.isPending}
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
                  <Table
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
              size="large"
              block
              loading={importCommit.isPending}
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
