export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "reset_password"
  | "deactivate"
  | "register"
  | "settle"
  | "user.register"
  | "user.update_phone"
  | "user.update_username"
  | "user.change_password"
  | "user.reset_password"
  | "user.update_role"
  | "user.deactivate";

export type AuditTargetType = "employee" | "user" | "course" | "payroll" | "User";

export type AuditRecordInput = {
  operatorId: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};
