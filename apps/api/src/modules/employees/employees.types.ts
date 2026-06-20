import type { Employee, EmploymentStatus } from "@prisma/client";

export type EmployeeListItem = Pick<
  Employee,
  | "id"
  | "jobNo"
  | "billingType"
  | "name"
  | "gender"
  | "employmentStatus"
  | "jobTitle"
  | "phone"
  | "source"
  | "servingFor"
  | "hireDate"
>;

export type EmployeeDetail = Employee & {
  /** Phase 1A 占位；Phase 3 切真实查询。 */
  relatedCourses: string[];
};

export type EmployeeListResponse = {
  items: EmployeeListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ImportRowError = {
  row: number;
  field: string;
  message: string;
};

export type ImportReport = {
  totalRows: number;
  validRows: number;
  errors: ImportRowError[];
};

export type ImportCommitResult = {
  created: number;
  errors: ImportRowError[];
};

export type { EmploymentStatus };
