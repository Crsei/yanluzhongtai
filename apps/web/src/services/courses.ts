import { api, downloadAuthed } from "./http";
import type {
  CourseDetail,
  CourseImportCommitResult,
  CourseImportReport,
  CourseListResponse,
  CourseQueryParams,
  CreateCourseBody,
  UpdateCourseBody,
} from "../features/courses/types";

function toQuery(params: CourseQueryParams): string {
  const search = new URLSearchParams();
  const set = (k: string, v: unknown) => {
    if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  };
  set("keyword", params.keyword);
  set("name", params.name);
  set("secondaryCategoryName", params.secondaryCategoryName);
  set("sectionCode", params.sectionCode);
  set("actualTeachingType", params.actualTeachingType);
  set("actualTeacherJobNo", params.actualTeacherJobNo);
  set("studentId", params.studentId);
  set("status", params.status);
  set("plannedAtFrom", params.plannedAtFrom);
  set("plannedAtTo", params.plannedAtTo);
  set("page", params.page);
  set("pageSize", params.pageSize);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const coursesApi = {
  list: (params: CourseQueryParams = {}) =>
    api.get<CourseListResponse>(`/courses${toQuery(params)}`),
  detail: (id: string) => api.get<CourseDetail>(`/courses/${id}`),
  create: (body: CreateCourseBody) => api.post<CourseDetail>("/courses", body),
  update: (id: string, body: UpdateCourseBody) =>
    api.put<CourseDetail>(`/courses/${id}`, body),
  removeMany: (ids: string[]) =>
    api.delete<{ deleted: number }>("/courses", { body: { ids } }),
  downloadTemplate: () =>
    downloadAuthed("/courses/import/template", "课程导入模板.xlsx"),
  importDryRun: (fileKey: string) =>
    api.post<CourseImportReport>("/courses/import/dry-run", { fileKey }),
  importCommit: (fileKey: string) =>
    api.post<CourseImportCommitResult>("/courses/import/commit", { fileKey }),

  exportExcel: () =>
    downloadAuthed("/courses/export", "课程记录导出.xlsx"),
};
