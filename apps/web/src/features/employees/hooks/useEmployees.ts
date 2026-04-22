import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { employeesApi } from "../../../services/employees";
import type { EmployeeQueryParams } from "../types";

export function useEmployees(params: EmployeeQueryParams) {
  return useQuery({
    queryKey: ["employees", params],
    queryFn: () => employeesApi.list(params),
    placeholderData: keepPreviousData,
  });
}
