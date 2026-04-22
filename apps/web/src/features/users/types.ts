import type { UserRole } from "../auth/types";

export type UserListItem = {
  id: string;
  phone: string;
  username: string;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
  deactivatedAt: string | null;
};

export type ListUsersParams = {
  page: number;
  pageSize: number;
  keyword?: string;
  includeDeactivated?: boolean;
};

export type ListUsersResponse = {
  items: UserListItem[];
  total: number;
};

export type RegisterUserPayload = {
  phone: string;
  username: string;
  role: UserRole;
};

export type RegisterUserResponse = {
  id: string;
  phone: string;
  username: string;
  role: UserRole;
  initialPassword: string;
};
