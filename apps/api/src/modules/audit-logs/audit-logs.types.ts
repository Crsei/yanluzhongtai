export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "reset_password"
  | "deactivate"
  | "register"
  | "settle";

export type AuditTargetType = "employee" | "user" | "course" | "payroll";

export type AuditRecordInput = {
  operatorId: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};
