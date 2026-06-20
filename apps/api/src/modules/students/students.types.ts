// apps/api/src/modules/students/students.types.ts
import type { Student } from "@prisma/client";

export type StudentListItem = Pick<
  Student,
  | "id"
  | "studentNo"
  | "name"
  | "gender"
  | "school"
  | "major"
  | "enrollmentYear"
  | "graduationYear"
  | "remainingPublicCredits"
  | "remainingPrivateCredits"
  | "serviceChecklistUrl"
  | "serviceChecklistKeys"
  | "serviceStatus"
  | "servicePlatform"
  | "counselorJobNo"
  | "plannerJobNo"
> & {
  grade: string | null;
};

export type StudentListResponse = {
  items: StudentListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type StudentDetail = Student & {
  grade: string | null;
  relatedCourseCategories: string[];
};

export type ImportError = { row: number; field: string; message: string };

export type ImportReport = {
  totalRows: number;
  validRows: number;
  errors: ImportError[];
};

export type ImportCommitResult = { created: number; errors: ImportError[] };
