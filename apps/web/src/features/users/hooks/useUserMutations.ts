import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "../../../services/users";
import type { RegisterUserPayload } from "../types";
import type { UserRole } from "../../auth/types";

export function useUserMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["users"] });

  const register = useMutation({
    mutationFn: (body: RegisterUserPayload) => usersApi.register(body),
    onSuccess: invalidate,
  });

  const updateRole = useMutation({
    mutationFn: (args: { id: string; role: UserRole }) =>
      usersApi.updateRole(args.id, { role: args.role }),
    onSuccess: invalidate,
  });

  const resetPassword = useMutation({
    mutationFn: (id: string) => usersApi.resetPassword(id),
  });

  const deactivate = useMutation({
    mutationFn: (args: { id: string; phoneConfirmation: string }) =>
      usersApi.deactivateUser(args.id, { phoneConfirmation: args.phoneConfirmation }),
    onSuccess: invalidate,
  });

  return { register, updateRole, resetPassword, deactivate };
}
