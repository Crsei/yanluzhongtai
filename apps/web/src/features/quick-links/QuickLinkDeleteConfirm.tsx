import { Modal } from "antd";
import { quickLinksApi } from "../../services/quickLinks";

export function confirmDeleteQuickLinks(
  ids: string[],
  onDone: () => void,
): void {
  Modal.confirm({
    title: `确定删除所选 ${ids.length} 条快捷入口？`,
    content: "删除后不可恢复。",
    okText: "删除",
    okButtonProps: { danger: true },
    cancelText: "取消",
    async onOk() {
      try {
        for (const id of ids) {
          // 逐条删除以便 audit 单独记录每一项
          // eslint-disable-next-line no-await-in-loop
          await quickLinksApi.remove(id);
        }
      } finally {
        // 即使中途失败也 invalidate 列表，避免残留本地态与服务器不一致
        onDone();
      }
    },
  });
}
