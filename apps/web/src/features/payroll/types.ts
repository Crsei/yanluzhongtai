export type PayrollTeachingType = "1v1" | "公共";

export type PayrollAutoRow = {
  kind: "auto";
  employeeJobNo: string;
  employeeName: string;
  employeeBillingType: string;
  period: string;
  teachingType: PayrollTeachingType;
  hourlyRate: number | null;
  deliveredHours: number;
  totalCourseFee: number | null;
  extraLabor: number;
  extraDeduction: number;
  subtotalPayable: number | null;
  subtotalPaid: number;
  settlementIds: string[];
};

export type PayrollManualRow = {
  kind: "manual";
  id: string;
  employeeJobNo: string;
  employeeName: string;
  employeeBillingType: string;
  period: string;
  teachingType: null;
  hourlyRate: null;
  deliveredHours: 0;
  totalCourseFee: 0;
  extraLabor: number;
  extraDeduction: number;
  subtotalPayable: number;
  subtotalPaid: number;
  createdAt: string;
};

export type PayrollRow = PayrollAutoRow | PayrollManualRow;

export type PayrollListResponse = {
  items: PayrollRow[];
  total: number;
};

export type PayrollRowState = {
  employeeJobNo: string;
  employeeName: string;
  employeeBillingType: string;
  period: string;
  teachingType: PayrollTeachingType;
  hourlyRate: number | null;
  deliveredHours: number;
  payable: number | null;
  alreadyPaid: number;
};

export type PayrollCourseItem = {
  id: string;
  courseNo: string;
  name: string;
  plannedAt: string | null;
  creditHours: number | null;
  durationMinutes: number | null;
  actualTeachingType: string | null;
  enrolledStudentCount: number;
};

export type PayrollQueryParams = {
  from: string;
  to: string;
  keyword?: string;
  unpaidOnly?: boolean;
};

export type SettlePayrollBody = {
  employeeJobNo: string;
  settlementPeriod: string;
  teachingType: PayrollTeachingType;
  hourlyRate: string;
  paidAmount: string;
  extraLabor: string;
  extraDeduction: string;
};

export type SettleManualRecordBody = {
  paidAmount: string;
};

export type CreateManualRecordBody = {
  employeeJobNo: string;
  settlementPeriod: string;
  extraLabor: string;
  extraDeduction: string;
};

export type PayrollRangeMode = "current" | "previous" | "custom";
