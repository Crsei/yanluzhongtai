import { ExclamationCircleFilled } from "@ant-design/icons";
import { Input, Modal, Typography, message } from "antd";
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

export function confirmDeleteEmployees(
  employees: Array<{ id: string; name: string; jobNo: string }>,
  mutations: Mutations,
): void {
  let confirmText = "";
  Modal.confirm({
    title: `确认删除 ${employees.length} 条员工数据？`,
    icon: <ExclamationCircleFilled style={{ color: "#ff4d4f" }} />,
    content: (
      <div>
        <Typography.Paragraph type="warning">
          删除操作不可恢复。请确认以下所有员工均可删除。
        </Typography.Paragraph>
        <ul style={{ maxHeight: 220, overflow: "auto", paddingLeft: 20 }}>
          {employees.map((employee) => (
            <li key={employee.id}>
              <code>{employee.jobNo}</code> · {employee.name}
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
      await mutations.removeManyMutation.mutateAsync(employees.map((item) => item.id));
    },
  });
}
