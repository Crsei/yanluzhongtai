// apps/web/src/services/students.ts
import { api, downloadAuthed } from "./http";

export type StudentListItem = {
  id: string;
  studentNo: string;
  name: string;
  gender: string;
  school: string | null;
  major: string | null;
  enrollmentYear: number;
  graduationYear: number;
  counselorJobNo: string | null;
  plannerJobNo: string | null;
  remainingPublicCredits: string | null;
  remainingPrivateCredits: string | null;
  serviceStatus:
    | "NOT_STARTED"
    | "IN_SERVICE"
    | "PAUSED"
    | "TERMINATED"
    | "COMPLETED";
  servicePlatform: string;
  grade: string | null;
};

export type StudentListResponse = {
  items: StudentListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type StudentDetail = StudentListItem & {
  phone: string | null;
  email: string | null;
  source: string;
  totalPublicCredits: string | null;
  totalPrivateCredits: string | null;
  serviceChecklistUrl: string | null;
  serviceChecklistKeys: string[];
  overallPlanUrl: string | null;
  overallPlanText: string | null;
  policyKeys: string[];
  policyText: string | null;
  detailNotes: unknown;
  scheduleKeys: string[];
  transcriptKeys: string[];
  attachmentKeys: string[];
  note: string | null;
  createdAt: string;
  updatedAt: string;
  relatedCourseCategories: string[];
};

export type StudentQueryParams = {
  keyword?: string;
  studentNo?: string;
  name?: string;
  grade?: string;
  major?: string;
  source?: string;
  servicePlatform?: string;
  page?: number;
  pageSize?: number;
};

export type CreateStudentBody = Omit<
  StudentDetail,
  | "id"
  | "studentNo"
  | "createdAt"
  | "updatedAt"
  | "grade"
  | "relatedCourseCategories"
>;

export type UpdateStudentBody = Partial<Omit<CreateStudentBody, "enrollmentYear">>;

export type ImportReport = {
  totalRows: number;
  validRows: number;
  errors: Array<{ row: number; field: string; message: string }>;
};

export type ImportCommitResult = {
  created: number;
  errors: ImportReport["errors"];
};

function toQuery(params: StudentQueryParams): string {
  const search = new URLSearchParams();
  if (params.keyword) search.set("keyword", params.keyword);
  if (params.studentNo) search.set("studentNo", params.studentNo);
  if (params.name) search.set("name", params.name);
  if (params.grade) search.set("grade", params.grade);
  if (params.major) search.set("major", params.major);
  if (params.source) search.set("source", params.source);
  if (params.servicePlatform) search.set("servicePlatform", params.servicePlatform);
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const studentsApi = {
  list: (params: StudentQueryParams = {}) =>
    api.get<StudentListResponse>(`/students${toQuery(params)}`),
  detail: (id: string) => api.get<StudentDetail>(`/students/${id}`),
  create: (body: CreateStudentBody) => api.post<StudentDetail>("/students", body),
  update: (id: string, body: UpdateStudentBody) =>
    api.put<StudentDetail>(`/students/${id}`, body),
  remove: (id: string) => api.delete<void>(`/students/${id}`),
  importDryRun: (fileKey: string) =>
    api.post<ImportReport>("/students/import/dry-run", { fileKey }),
  importCommit: (fileKey: string) =>
    api.post<ImportCommitResult>("/students/import/commit", { fileKey }),
  downloadTemplate: () =>
    downloadAuthed("/students/import/template", "学生导入模板.xlsx"),
};
