export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "reset_password"
  | "deactivate"
  | "register"
  | "settle"
  | "import_overwrite"
  | "user.register"
  | "user.update_phone"
  | "user.update_username"
  | "user.change_password"
  | "user.reset_password"
  | "user.update_role"
  | "user.deactivate"
  | "student.create"
  | "student.update"
  | "student.delete"
  | "course.create"
  | "course.update"
  | "course.delete";

export type AuditTargetType =
  | "employee"
  | "user"
  | "course"
  | "payroll"
  | "payroll_settlement"
  | "payroll_manual_record"
  | "User"
  | "student"
  | "course_outline_version"
  | "course_outline_item";

export type AuditRecordInput = {
  operatorId: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};
