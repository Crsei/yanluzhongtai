export const EMPLOYMENT_STATUS = ["FULL_TIME", "PART_TIME", "RESIGNED"] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUS)[number];

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  FULL_TIME: "全职",
  PART_TIME: "兼职",
  RESIGNED: "已离职",
};

export const EMPLOYMENT_STATUS_OPTIONS = EMPLOYMENT_STATUS.map((value) => ({
  value,
  label: EMPLOYMENT_STATUS_LABELS[value],
}));

export const GENDER = ["男", "女"] as const;
export type Gender = (typeof GENDER)[number];
export const GENDER_OPTIONS = GENDER.map((value) => ({ value, label: value }));

export const EMPLOYEE_SOURCE = ["研录", "招聘/临时", "渠道合作", "其他"] as const;
export type EmployeeSource = (typeof EMPLOYEE_SOURCE)[number];
export const EMPLOYEE_SOURCE_OPTIONS = EMPLOYEE_SOURCE.map((value) => ({
  value,
  label: value,
}));

export const EMPLOYEE_SERVING_FOR = [
  "研录保研",
  "研录考研",
  "高途",
  "内部管理",
  "其他",
] as const;
export type EmployeeServingFor = (typeof EMPLOYEE_SERVING_FOR)[number];
export const EMPLOYEE_SERVING_FOR_OPTIONS = EMPLOYEE_SERVING_FOR.map((value) => ({
  value,
  label: value,
}));

export const EMPLOYMENT_STATUS_TAG_COLOR: Record<EmploymentStatus, string> = {
  FULL_TIME: "blue",
  PART_TIME: "geekblue",
  RESIGNED: "default",
};

// ---------------------------------------------------------------------------
// Phase 2: Student dictionaries (mirror of apps/api/src/common/dictionaries.ts)
// ---------------------------------------------------------------------------

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

export const SERVICE_STATUS_COLORS: Record<ServiceStatus, string> = {
  NOT_STARTED: "default",
  IN_SERVICE: "success",
  PAUSED: "warning",
  TERMINATED: "error",
  COMPLETED: "blue",
};

export const SERVICE_STATUS_OPTIONS = SERVICE_STATUS.map((code) => ({
  value: code,
  label: SERVICE_STATUS_LABELS[code],
}));

export const SERVICE_PLATFORM = ["研录保研", "研录考研", "高途", "其他"] as const;
export type ServicePlatform = (typeof SERVICE_PLATFORM)[number];
export const SERVICE_PLATFORM_OPTIONS = SERVICE_PLATFORM.map((v) => ({ value: v, label: v }));

export const STUDENT_SOURCE = [
  "自有流量",
  "研录考研",
  "高途",
  "转介绍",
  "其他",
] as const;
export type StudentSource = (typeof STUDENT_SOURCE)[number];
export const STUDENT_SOURCE_OPTIONS = STUDENT_SOURCE.map((v) => ({ value: v, label: v }));

export const GRADE_VALUES = [
  "大一",
  "大二",
  "大三",
  "大四",
  "大五",
  "已毕业",
] as const;
export type GradeValue = (typeof GRADE_VALUES)[number];
export const GRADE_OPTIONS = GRADE_VALUES.map((v) => ({ value: v, label: v }));

// ---------------------------------------------------------------------------
// Phase 3: Course outline dictionaries
// ---------------------------------------------------------------------------

export const TEACHING_TYPE = ["公共课", "1v1", "小班课", "录播", "其他"] as const;
export type TeachingType = (typeof TEACHING_TYPE)[number];
export const TEACHING_TYPE_OPTIONS = TEACHING_TYPE.map((value) => ({
  value,
  label: value,
}));
