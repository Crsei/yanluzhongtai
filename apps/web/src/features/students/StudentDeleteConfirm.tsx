// apps/web/src/features/students/StudentDeleteConfirm.tsx
import { ExclamationCircleFilled } from "@ant-design/icons";
import { Input, Modal, message, theme } from "antd";

export function openStudentDeleteConfirm(opts: {
  studentName: string;
  studentNo: string;
  onConfirm: () => Promise<void> | void;
}) {
  const token = theme.getDesignToken();
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

export function openStudentsDeleteConfirm(opts: {
  students: Array<{ id: string; studentName: string; studentNo: string }>;
  onConfirm: () => Promise<void> | void;
}) {
  const token = theme.getDesignToken();
  let confirmText = "";
  Modal.confirm({
    title: `确认删除 ${opts.students.length} 条学生数据？`,
    icon: <ExclamationCircleFilled style={{ color: token.colorError }} />,
    content: (
      <div>
        <p>删除操作不可恢复。即将删除以下学生：</p>
        <ul style={{ maxHeight: 220, overflow: "auto", paddingLeft: 20 }}>
          {opts.students.map((student) => (
            <li key={student.id}>
              <code>{student.studentNo}</code> · {student.studentName}
            </li>
          ))}
        </ul>
        <Input
          placeholder="请输入：我确认删除以上所有数据"
          onChange={(event) => {
            confirmText = event.target.value;
          }}
        />
      </div>
    ),
    okText: "确认删除",
    okButtonProps: { danger: true },
    cancelText: "取消",
    onOk: async () => {
      if (confirmText !== "我确认删除以上所有数据") {
        message.error("确认文本不匹配");
        throw new Error("确认文本不匹配");
      }
      await opts.onConfirm();
    },
  });
}
