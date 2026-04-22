// Backend dictionaries for DTO validation and storage whitelisting.
//
// NOTE: `EmploymentStatus` exported from this file is a string-literal union
// for use with class-validator's `@IsIn(EMPLOYMENT_STATUS)`. The Prisma
// generated `EmploymentStatus` enum (from "@prisma/client") shares the same
// values but is a separate type — import it from "@prisma/client" when typing
// Prisma queries, and from this file when validating DTOs.

export const EMPLOYMENT_STATUS = ["FULL_TIME", "PART_TIME", "RESIGNED"] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUS)[number];

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  FULL_TIME: "全职",
  PART_TIME: "兼职",
  RESIGNED: "已离职",
};

/** spec §4.3: 全职 + 兼职 排在前 (sort=0); 已离职 在后 (sort=1) */
export const EMPLOYMENT_STATUS_SORT: Record<EmploymentStatus, number> = {
  FULL_TIME: 0,
  PART_TIME: 0,
  RESIGNED: 1,
};

export const GENDER = ["男", "女"] as const;
export type Gender = (typeof GENDER)[number];

export const EMPLOYEE_SOURCE = ["研录", "招聘/临时", "渠道合作", "其他"] as const;
export type EmployeeSource = (typeof EMPLOYEE_SOURCE)[number];

export const EMPLOYEE_SERVING_FOR = [
  "研录保研",
  "研录考研",
  "高途",
  "内部管理",
  "其他",
] as const;
export type EmployeeServingFor = (typeof EMPLOYEE_SERVING_FOR)[number];

// ---------------------------------------------------------------------------
// Phase 2: Student dictionaries
// ---------------------------------------------------------------------------

/** Mirrors Prisma enum ServiceStatus. */
export const SERVICE_STATUS = [
  "NOT_STARTED",
  "IN_SERVICE",
  "PAUSED",
  "TERMINATED",
  "COMPLETED",
] as const;
export type ServiceStatus = (typeof SERVICE_STATUS)[number];

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  NOT_STARTED: "未开始",
  IN_SERVICE: "正常服务中",
  PAUSED: "服务暂缓",
  TERMINATED: "取消或终止",
  COMPLETED: "服务完成",
};

/** spec §4.3 first-priority sort: 未开始 > 正常服务中 > 服务暂缓 > 取消或终止 > 服务完成 */
export const SERVICE_STATUS_SORT: Record<ServiceStatus, number> = {
  NOT_STARTED: 0,
  IN_SERVICE: 1,
  PAUSED: 2,
  TERMINATED: 3,
  COMPLETED: 4,
};

/** Reverse map for Excel import: Chinese label → enum code */
export const SERVICE_STATUS_BY_LABEL: Record<string, ServiceStatus> =
  Object.fromEntries(
    Object.entries(SERVICE_STATUS_LABELS).map(([code, label]) => [label, code as ServiceStatus]),
  );

export const SERVICE_PLATFORM = ["研录保研", "研录考研", "高途", "其他"] as const;
export type ServicePlatform = (typeof SERVICE_PLATFORM)[number];

export const STUDENT_SOURCE = [
  "自有流量",
  "研录考研",
  "高途",
  "转介绍",
  "其他",
] as const;
export type StudentSource = (typeof STUDENT_SOURCE)[number];

/** Frontend-only display dict; backend computes from enrollmentYear/graduationYear. */
export const GRADE_VALUES = [
  "大一",
  "大二",
  "大三",
  "大四",
  "大五",
  "已毕业",
] as const;
export type GradeValue = (typeof GRADE_VALUES)[number];

/** Whitelist of allowed presign upload prefixes. */
export const STORAGE_FOLDERS = [
  "employees/attachments",
  "employees/import-batches",
  "students/attachments",
  "students/import-batches",
] as const;
export type StorageFolder = (typeof STORAGE_FOLDERS)[number];
