// apps/web/src/features/students/StudentDeleteConfirm.tsx
import { ExclamationCircleFilled } from "@ant-design/icons";
import { Modal, theme } from "antd";

export function openStudentDeleteConfirm(opts: {
  studentName: string;
  studentNo: string;
  onConfirm: () => Promise<void> | void;
}) {
  const { token } = theme.getDesignToken();
  Modal.confirm({
    title: "确认删除该学生？",
    icon: <ExclamationCircleFilled style={{ color: token.colorError }} />,
    content: (
      <div>
        <p>
          即将删除：<b>{opts.studentNo} {opts.studentName}</b>
        </p>
        <p>
          删除操作不可恢复。若学生服务结束，建议改为 <b>服务完成</b> 或 <b>取消或终止</b> 状态保留档案。学号删除后不回收。
        </p>
      </div>
    ),
    okText: "确认删除",
    okButtonProps: { danger: true },
    cancelText: "取消",
    onOk: async () => opts.onConfirm(),
  });
}
