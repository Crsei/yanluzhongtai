export const PAYROLL_TEACHING_TYPES = ["1v1", "公共"] as const;

export type PayrollTeachingType = (typeof PAYROLL_TEACHING_TYPES)[number];

export function normalizePayrollTeachingType(
  actualTeachingType: string | null | undefined,
): PayrollTeachingType {
  return actualTeachingType === "1v1" ? "1v1" : "公共";
}
