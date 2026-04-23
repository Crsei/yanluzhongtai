import { api } from "./http";
import type {
  CreateManualRecordBody,
  PayrollCourseItem,
  PayrollListResponse,
  PayrollQueryParams,
  PayrollRowState,
  SettlePayrollBody,
} from "../features/payroll/types";

function toQuery(params: PayrollQueryParams): string {
  const search = new URLSearchParams();
  const set = (k: string, v: unknown) => {
    if (v !== undefined && v !== null && v !== "") {
      search.set(k, String(v));
    }
  };
  set("from", params.from);
  set("to", params.to);
  set("keyword", params.keyword);
  set("unpaidOnly", params.unpaidOnly ? "true" : undefined);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const payrollApi = {
  list: (params: PayrollQueryParams) =>
    api.get<PayrollListResponse>(`/payroll${toQuery(params)}`),
  rowState: (jobNo: string, period: string) =>
    api.get<PayrollRowState>(
      `/payroll/row/${encodeURIComponent(jobNo)}/${encodeURIComponent(period)}`,
    ),
  coursesForTeacherPeriod: (teacherJobNo: string, period: string) =>
    api.get<PayrollCourseItem[]>(
      `/payroll/courses?teacherJobNo=${encodeURIComponent(teacherJobNo)}&period=${encodeURIComponent(period)}`,
    ),
  settle: (body: SettlePayrollBody) =>
    api.post<unknown>(`/payroll/settlements`, body),
  addManual: (body: CreateManualRecordBody) =>
    api.post<unknown>(`/payroll/manual-records`, body),
  deleteManual: (id: string) =>
    api.delete<void>(`/payroll/manual-records/${encodeURIComponent(id)}`),
};
