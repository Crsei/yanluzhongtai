import { Modal } from "antd";

export function confirmDeleteCourses(
  items: Array<{ id: string; courseNo: string; name: string }>,
  onConfirm: () => Promise<void>,
): void {
  Modal.confirm({
    title: `确认删除 ${items.length} 门课程?`,
    content: (
      <div>
        <p>删除后不可恢复,且流水号不会回收。</p>
        <ul style={{ maxHeight: 200, overflow: "auto", paddingLeft: 20 }}>
          {items.map((c) => (
            <li key={c.id}>
              <code>{c.courseNo}</code> · {c.name}
            </li>
          ))}
        </ul>
      </div>
    ),
    okText: "删除",
    okType: "danger",
    cancelText: "取消",
    onOk: onConfirm,
  });
}
