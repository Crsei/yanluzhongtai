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
