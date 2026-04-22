import { api } from "./http";
import type {
  ListUsersParams,
  ListUsersResponse,
  RegisterUserPayload,
  RegisterUserResponse,
} from "../features/users/types";
import type { UserRole } from "../features/auth/types";

function buildQuery(params: ListUsersParams): string {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  if (params.keyword) qs.set("keyword", params.keyword);
  if (params.includeDeactivated) qs.set("includeDeactivated", "true");
  return `?${qs.toString()}`;
}

export const usersApi = {
  list: (params: ListUsersParams) =>
    api.get<ListUsersResponse>(`/users${buildQuery(params)}`),

  register: (body: RegisterUserPayload) =>
    api.post<RegisterUserResponse>("/users", body),

  updateMyPhone: (body: { newPhone: string; currentPassword: string }) =>
    api.patch<void>("/users/me/phone", body),

  updateMyUsername: (body: { newUsername: string }) =>
    api.patch<void>("/users/me/username", body),

  changeMyPassword: (body: { oldPassword: string; newPassword: string }) =>
    api.patch<void>("/users/me/password", body),

  initialChangeMyPassword: (body: { newPassword: string }) =>
    api.post<void>("/users/me/initial-password-change", body),

  deactivateMe: (body: { phoneConfirmation: string }) =>
    api.post<void>("/users/me/deactivate", body),

  updateRole: (id: string, body: { role: UserRole }) =>
    api.patch<void>(`/users/${id}/role`, body),

  resetPassword: (id: string) =>
    api.post<{ tempPassword: string }>(`/users/${id}/reset-password`),

  deactivateUser: (id: string, body: { phoneConfirmation: string }) =>
    api.post<void>(`/users/${id}/deactivate`, body),
};
