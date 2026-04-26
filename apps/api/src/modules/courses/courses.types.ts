import type { CourseStatusCode } from "../../common/course-no/course-status";

export type CourseListItem = {
  id: string;
  courseNo: string;
  name: string | null;
  sectionCode: string | null;
  sectionName: string | null;
  categorySequenceNo: string | null;
  secondaryCategoryName: string | null;
  plannedAt: Date | null;
  status: CourseStatusCode;
  actualTeachingType: string | null;
  actualTeacher: { jobNo: string; name: string | null; employmentStatus: string | null } | null;
  enrolledStudentCount: number;
};

export type CourseDetailStudent = {
  id: string;
  studentNo: string;
  name: string | null;
  servicePlatform: string | null;
};

export type CourseDetail = {
  id: string;
  courseNo: string;
  name: string | null;
  outlineVersionId: string | null;
  outlineItemId: string | null;
  outlineVersionName: string | null;
  sectionCode: string | null;
  sectionName: string | null;
  categorySequenceNo: string | null;
  secondaryCategoryName: string | null;
  suggestedTeachingType: string | null;
  plannedAt: Date | null;
  courseYear: number | null;
  actualTeacherJobNo: string | null;
  actualTeacher: { jobNo: string; name: string | null; employmentStatus: string | null } | null;
  actualTeachingType: string | null;
  durationMinutes: number | null;
  creditHours: string | null;
  status: CourseStatusCode;
  replayUrl: string | null;
  videoUrl: string | null;
  resourceUrl: string | null;
  note: string | null;
  students: CourseDetailStudent[];
  createdAt: Date;
  updatedAt: Date;
};

export type CourseListResponse = {
  items: CourseListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type CourseImportRowError = {
  row: number;
  field: string;
  message: string;
};

export type CourseImportReport = {
  totalRows: number;
  validRows: number;
  errors: CourseImportRowError[];
};

export type CourseImportCommitResult = {
  created: number;
  errors: CourseImportRowError[];
};
