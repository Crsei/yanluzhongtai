/**
 * Payroll row shapes returned to the web client. "auto" rows are
 * realtime-aggregated from Course + historical PayrollSettlement; "manual"
 * rows are PayrollManualRecord rows. Same (teacher, period) may produce
 * one auto row + zero or more manual rows.
 */

import type { PayrollTeachingType } from "../../common/payroll/teaching-type";

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
