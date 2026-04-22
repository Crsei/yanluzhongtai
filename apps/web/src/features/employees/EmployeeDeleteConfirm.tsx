import { ExclamationCircleFilled } from "@ant-design/icons";
import { Modal, Typography } from "antd";
import type { useEmployeeMutations } from "./hooks/useEmployeeMutations";

type Mutations = ReturnType<typeof useEmployeeMutations>;

export function confirmDeleteEmployee(
  employee: { id: string; name: string; jobNo: string },
  mutations: Mutations,
): void {
  Modal.confirm({
    title: `确认删除员工 ${employee.name}（工号 ${employee.jobNo}）？`,
    icon: <ExclamationCircleFilled style={{ color: "#ff4d4f" }} />,
    content: (
      <div>
        <Typography.Paragraph style={{ marginBottom: 8 }}>
          员工离职建议优先在编辑里改状态为"已离职"，不要直接删除。
        </Typography.Paragraph>
        <Typography.Paragraph type="warning" style={{ marginBottom: 0 }}>
          删除会影响关联数据（薪酬记录、历史课程、所带学生等），且无法恢复。
        </Typography.Paragraph>
      </div>
    ),
    okText: "确认删除",
    okButtonProps: { danger: true },
    cancelText: "取消",
    onOk: () => mutations.removeMutation.mutateAsync(employee.id),
  });
}
