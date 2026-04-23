import type { CourseOutlineItem, CourseOutlineVersion, CourseSection } from "@prisma/client";

export type VersionListItem = {
  id: string;
  versionName: string;
  isActive: boolean;
  itemCount: number;
  createdAt: Date;
};

export type PlannedTeacherSummary = {
  jobNo: string;
  name: string;
  employmentStatus: string;
};

export type ActualTeacherSummary = {
  jobNo: string;
  name: string;
  employmentStatus: string;
  courseCount: number;
};

export type CourseOutlineItemDetail = CourseOutlineItem & {
  plannedTeacher: PlannedTeacherSummary | null;
  actualTeachers: ActualTeacherSummary[];
};

export type VersionDetail = {
  version: CourseOutlineVersion;
  sections: CourseSection[];
  items: CourseOutlineItemDetail[];
};

export type ImportRowError = {
  row: number;
  field: string;
  message: string;
};

export type OutlineImportReport = {
  totalRows: number;
  validRows: number;
  uniqueSections: number;
  errors: ImportRowError[];
};

export type OutlineImportCommitResult = {
  createdSections: number;
  createdItems: number;
  errors: ImportRowError[];
};
