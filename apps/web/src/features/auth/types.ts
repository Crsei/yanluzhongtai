export type UserRole = "SUPER_ADMIN" | "ADMIN" | "MEMBER";

export type AuthUser = {
  id: string;
  phone: string;
  username: string;
  role: UserRole;
};

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "超级管理员",
  ADMIN: "管理员",
  MEMBER: "一般成员",
};
