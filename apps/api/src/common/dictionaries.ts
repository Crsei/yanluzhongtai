// apps/api/src/common/dictionaries.ts

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

/** Whitelist of allowed presign upload prefixes; see Task 4. */
export const STORAGE_FOLDERS = [
  "employees/attachments",
  "employees/import-batches",
] as const;
export type StorageFolder = (typeof STORAGE_FOLDERS)[number];
