import { ExclamationCircleFilled } from "@ant-design/icons";
import { Modal } from "antd";

type Target = { id: string; secondaryCategoryName: string };

export function confirmDeleteItems(
  targets: Target[],
  onOk: () => Promise<unknown> | void,
) {
  Modal.confirm({
    title: "确认从大纲删除以下条目?",
    icon: <ExclamationCircleFilled />,
    content: (
      <div>
        <p>即将删除 {targets.length} 个二级课程类别:</p>
        <ul style={{ paddingLeft: 20, maxHeight: 240, overflowY: "auto" }}>
          {targets.map((t) => (
            <li key={t.id}>{t.secondaryCategoryName}</li>
          ))}
        </ul>
        <p style={{ color: "#faad14" }}>
          若现有课程引用了这些分类,对应课程的分类将在 Phase 4 课程模块落地后变为空值。
        </p>
      </div>
    ),
    okText: "确认删除",
    okButtonProps: { danger: true },
    cancelText: "取消",
    onOk,
  });
}
