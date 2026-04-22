import type {
  EmployeeServingFor,
  EmployeeSource,
  EmploymentStatus,
  Gender,
} from "../../constants/dictionaries";

export type EmployeeListItem = {
  id: string;
  jobNo: string;
  name: string;
  gender: Gender | string;
  employmentStatus: EmploymentStatus;
  jobTitle: string;
  phone: string | null;
  source: EmployeeSource | string | null;
  servingFor: string[];
  hireDate: string | null;
};

export type EmployeeDetail = EmployeeListItem & {
  bankCardNo: string | null;
  bankName: string | null;
  resumeText: string | null;
  attachmentKeys: string[];
  createdAt: string;
  updatedAt: string;
  relatedCourses: string[];
};

export type EmployeeListResponse = {
  items: EmployeeListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type EmployeeQueryParams = {
  keyword?: string;
  page?: number;
  pageSize?: number;
  /** Single code or comma-separated list (e.g. "FULL_TIME,PART_TIME") */
  employmentStatus?: EmploymentStatus | string;
  /** Single jobNo or comma-separated list for exact lookup */
  jobNo?: string;
};

export type CreateEmployeeBody = {
  name: string;
  gender: Gender;
  employmentStatus: EmploymentStatus;
  jobTitle: string;
  hireDate?: string;
  phone?: string;
  bankCardNo?: string;
  bankName?: string;
  source?: EmployeeSource;
  servingFor?: EmployeeServingFor[];
  resumeText?: string;
  attachmentKeys?: string[];
};

export type UpdateEmployeeBody = Partial<CreateEmployeeBody>;

export type ImportRowError = { row: number; field: string; message: string };
export type ImportReport = {
  totalRows: number;
  validRows: number;
  errors: ImportRowError[];
};
export type ImportCommitResult = { created: number; errors: ImportRowError[] };
