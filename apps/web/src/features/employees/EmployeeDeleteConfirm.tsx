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
        <Typography.Paragraph type="warning" style={{ marginBottom: 0 }}>
          若员工离职，请修改其在职状态，而不是直接删除。删除员工将会影响所有与其关联的数据或字段！您确定要继续删除吗？
        </Typography.Paragraph>
      </div>
    ),
    okText: "确认删除",
    okButtonProps: { danger: true },
    cancelText: "取消",
    onOk: () => mutations.removeMutation.mutateAsync(employee.id),
  });
}
