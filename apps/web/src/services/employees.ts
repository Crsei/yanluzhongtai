import { api, downloadAuthed } from "./http";
import type {
  CreateEmployeeBody,
  EmployeeDetail,
  EmployeeListResponse,
  EmployeeQueryParams,
  ImportCommitResult,
  ImportReport,
  UpdateEmployeeBody,
} from "../features/employees/types";

function toQuery(params: EmployeeQueryParams): string {
  const search = new URLSearchParams();
  if (params.keyword) search.set("keyword", params.keyword);
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  if (params.employmentStatus) search.set("employmentStatus", params.employmentStatus);
  if (params.jobNo) search.set("jobNo", params.jobNo);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const employeesApi = {
  list: (params: EmployeeQueryParams = {}) =>
    api.get<EmployeeListResponse>(`/employees${toQuery(params)}`),
  detail: (id: string) => api.get<EmployeeDetail>(`/employees/${id}`),
  create: (body: CreateEmployeeBody) => api.post<EmployeeDetail>("/employees", body),
  update: (id: string, body: UpdateEmployeeBody) =>
    api.put<EmployeeDetail>(`/employees/${id}`, body),
  remove: (id: string) => api.delete<void>(`/employees/${id}`),
  importDryRun: (fileKey: string) =>
    api.post<ImportReport>("/employees/import/dry-run", { fileKey }),
  importCommit: (fileKey: string) =>
    api.post<ImportCommitResult>("/employees/import/commit", { fileKey }),
  downloadTemplate: () =>
    downloadAuthed("/employees/import/template", "员工导入模板.xlsx"),

  findByJobNo: async (jobNo: string) => {
    const resp = await employeesApi.list({ jobNo, pageSize: 1 });
    return resp.items[0] ?? null;
  },

  listByJobNos: async (jobNos: string[]) => {
    if (jobNos.length === 0) return [];
    const resp = await employeesApi.list({
      jobNo: jobNos.join(","),
      pageSize: jobNos.length,
    });
    return resp.items;
  },
};
