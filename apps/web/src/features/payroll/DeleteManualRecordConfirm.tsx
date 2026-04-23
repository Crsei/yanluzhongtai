import { Modal } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";

export function confirmDeleteManualRecord(options: {
  period: string;
  employeeName: string;
  onConfirm: () => Promise<void> | void;
}): void {
  Modal.confirm({
    title: "删除手动薪酬记录",
    icon: <ExclamationCircleOutlined />,
    content: (
      <div>
        即将删除 <strong>{options.employeeName}</strong> 在{" "}
        <strong>{options.period}</strong> 的手动记录。
        <br />
        删除后不可恢复,但日志仍保留。是否继续?
      </div>
    ),
    okText: "确认删除",
    okButtonProps: { danger: true },
    cancelText: "取消",
    onOk: async () => {
      await options.onConfirm();
    },
  });
}
