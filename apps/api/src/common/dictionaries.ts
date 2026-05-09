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

export const SERVICE_PLATFORM = [
  "企业微信",
  "飞书",
  "微信",
  "研录保研",
  "研录考研",
  "高途",
  "其他",
] as const;
export type ServicePlatform = (typeof SERVICE_PLATFORM)[number];

export const STUDENT_SOURCE = [
  "自有流量",
  "自营（保研）",
  "自营（考研/单项）",
  "研录考研",
  "高途",
  "高途合作",
  "转介绍",
  "陈崔-渠道合作",
  "其他",
] as const;
export type StudentSource = (typeof STUDENT_SOURCE)[number];

/**
 * Frontend-only display dict; backend computes from enrollmentYear/graduationYear.
 * spec §3.3.2: 越接近毕业,急迫感越强,用 emoji 后缀表示。
 *   大一        (无后缀)
 *   大二❕      (轻微提醒)
 *   大三❗      (提醒)
 *   大四❗❗    (强烈提醒)
 *   大五❗❗    (强烈提醒)
 *   已毕业      (无后缀)
 */
export const GRADE_VALUES = [
  "大一",
  "大二❕",
  "大三❗",
  "大四❗❗",
  "大五❗❗",
  "已毕业",
] as const;
export type GradeValue = (typeof GRADE_VALUES)[number];

/** Whitelist of allowed presign upload prefixes. */
export const STORAGE_FOLDERS = [
  "employees/attachments",
  "employees/import-batches",
  "students/attachments",
  "students/import-batches",
  "course-outlines/import-batches",
  "courses/import-batches",
] as const;
export type StorageFolder = (typeof STORAGE_FOLDERS)[number];

// ---------------------------------------------------------------------------
// Phase 3: Course outline dictionaries
// ---------------------------------------------------------------------------

/** 建议 / 实际授课方式 — shared between Phase 3 大纲 and Phase 4 课程详情。 */
export const TEACHING_TYPE = [
  "公共课",
  "公共课直播",
  "1v1",
  "小班课",
  "录播",
  "分发录播",
  "推送资源",
  "外包",
  "其他",
] as const;
export type TeachingType = (typeof TEACHING_TYPE)[number];

/**
 * spec §2.3.3: 课程大纲的板块(TT)只能取下列 12 个枚举。
 * XX 是"请选择"占位(在显示界面中不会作小标题呈现),其余 11 个对应 UI 下拉选项。
 */
export const COURSE_SECTION_CODES = [
  "XX",
  "GP",
  "KY",
  "DC",
  "JS",
  "LW",
  "RZ",
  "ZL",
  "WZ",
  "ZP",
  "KA",
  "QT",
] as const;
export type CourseSectionCode = (typeof COURSE_SECTION_CODES)[number];

export const COURSE_SECTION_LABELS: Record<CourseSectionCode, string> = {
  XX: "--请选择--",
  GP: "GPA提升",
  KY: "科研赋能",
  DC: "大创项目",
  JS: "竞赛",
  LW: "论文",
  RZ: "软著",
  ZL: "专利",
  WZ: "外语与证书",
  ZP: "作品集辅导",
  KA: "考研系列课",
  QT: "其他",
};

/** 反向映射:Excel 导入时从中文名反查代码。 */
export const COURSE_SECTION_CODE_BY_LABEL: Record<string, CourseSectionCode> =
  Object.fromEntries(
    Object.entries(COURSE_SECTION_LABELS).map(([code, label]) => [
      label,
      code as CourseSectionCode,
    ]),
  );

// ---------------------------------------------------------------------------
// Phase 4: Course status (derived on read; kept here for DTO validation)
// ---------------------------------------------------------------------------

export const COURSE_STATUS = [
  "NOT_SCHEDULED",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
] as const;
export type CourseStatus = (typeof COURSE_STATUS)[number];

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  NOT_SCHEDULED: "未排期",
  SCHEDULED: "已排期",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
};

export const COURSE_STATUS_BY_LABEL: Record<string, CourseStatus> =
  Object.fromEntries(
    Object.entries(COURSE_STATUS_LABELS).map(([code, label]) => [label, code as CourseStatus]),
  );
