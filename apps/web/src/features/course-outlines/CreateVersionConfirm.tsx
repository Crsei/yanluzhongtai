import { ExclamationCircleFilled } from "@ant-design/icons";
import { Modal } from "antd";

export function confirmCreateVersion(onOk: () => Promise<unknown> | void) {
  Modal.confirm({
    title: "创建新大纲",
    icon: <ExclamationCircleFilled />,
    content:
      "即将创建新空白大纲;新版本将自动设为当前活跃版本,旧版本会自动退出活跃状态。是否继续?",
    okText: "确认创建",
    cancelText: "取消",
    onOk,
  });
}
