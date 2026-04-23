import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { auditLogsApi } from "../../../services/auditLogs";
import type { AuditLogQueryParams } from "../types";

export const auditLogsKey = (params: AuditLogQueryParams) =>
  ["audit-logs", params] as const;

export function useAuditLogs(params: AuditLogQueryParams) {
  return useQuery({
    queryKey: auditLogsKey(params),
    queryFn: () => auditLogsApi.list(params),
    placeholderData: keepPreviousData,
  });
}
