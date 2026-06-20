import { api, downloadAuthed } from "./http";
import type {
  AuditLogListResponse,
  AuditLogQueryParams,
} from "../features/audit-logs/types";

function toQuery(params: AuditLogQueryParams): string {
  const search = new URLSearchParams();
  const set = (k: string, v: unknown) => {
    if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  };
  set("page", params.page);
  set("pageSize", params.pageSize);
  set("operatorId", params.operatorId);
  set("targetType", params.targetType);
  set("action", params.action);
  set("fromDate", params.fromDate);
  set("toDate", params.toDate);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const auditLogsApi = {
  list: (params: AuditLogQueryParams = {}) =>
    api.get<AuditLogListResponse>(`/audit-logs${toQuery(params)}`),
  exportExcel: (params: AuditLogQueryParams = {}) =>
    downloadAuthed(`/audit-logs/export${toQuery(params)}`, "中台日志导出.xlsx"),
};
