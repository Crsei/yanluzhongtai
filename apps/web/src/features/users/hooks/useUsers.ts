import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usersApi } from "../../../services/users";
import type { ListUsersParams } from "../types";

export function useUsers(params: ListUsersParams) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: () => usersApi.list(params),
    placeholderData: keepPreviousData,
  });
}
