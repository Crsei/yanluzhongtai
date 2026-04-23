import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { payrollApi } from "../../../services/payroll";
import type { PayrollQueryParams } from "../types";

export const payrollKey = (params: PayrollQueryParams) =>
  ["payroll", params] as const;

export function usePayroll(params: PayrollQueryParams) {
  return useQuery({
    queryKey: payrollKey(params),
    queryFn: () => payrollApi.list(params),
    placeholderData: keepPreviousData,
  });
}
