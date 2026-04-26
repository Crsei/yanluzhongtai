import type { CourseStatus, TeachingType } from "../../constants/dictionaries";

export type CourseListItem = {
  id: string;
  courseNo: string;
  name: string | null;
  sectionCode: string | null;
  sectionName: string | null;
  categorySequenceNo: string | null;
  secondaryCategoryName: string | null;
  plannedAt: string | null;
  status: CourseStatus;
  actualTeachingType: TeachingType | null;
  actualTeacher: {
    jobNo: string;
    name: string;
    employmentStatus: string;
  } | null;
  enrolledStudentCount: number;
};

export type CourseListResponse = {
  items: CourseListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type CoursePickedStudent = {
  id: string;
  studentNo: string;
  name: string | null;
  servicePlatform: string | null;
};

export type CourseDetail = Omit<CourseListItem, "enrolledStudentCount"> & {
  outlineVersionId: string | null;
  outlineItemId: string | null;
  outlineVersionName: string | null;
  suggestedTeachingType: string | null;
  courseYear: number | null;
  actualTeacherJobNo: string | null;
  durationMinutes: number | null;
  creditHours: string | null;
  replayUrl: string | null;
  videoUrl: string | null;
  resourceUrl: string | null;
  note: string | null;
  students: CoursePickedStudent[];
  createdAt: string;
  updatedAt: string;
};

export type CourseQueryParams = {
  keyword?: string;
  name?: string;
  secondaryCategoryName?: string;
  sectionCode?: string;
  actualTeachingType?: TeachingType;
  actualTeacherJobNo?: string;
  studentId?: string;
  status?: CourseStatus;
  plannedAtFrom?: string;
  plannedAtTo?: string;
  page?: number;
  pageSize?: number;
};

export type CreateCourseBody = {
  outlineItemId?: string | null;
  name?: string | null;
  plannedAt?: string | null;
  actualTeacherJobNo?: string | null;
  actualTeachingType?: TeachingType | null;
  durationMinutes?: number | null;
  replayUrl?: string | null;
  videoUrl?: string | null;
  resourceUrl?: string | null;
  note?: string | null;
  studentIds?: string[];
};

export type UpdateCourseBody = Partial<CreateCourseBody>;

export type CourseImportReport = {
  totalRows: number;
  validRows: number;
  errors: Array<{ row: number; field: string; message: string }>;
};

export type CourseImportCommitResult = {
  created: number;
  errors: CourseImportReport["errors"];
};
