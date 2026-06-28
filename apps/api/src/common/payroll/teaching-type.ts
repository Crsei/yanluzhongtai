import { TEACHING_TYPE, type TeachingType } from "../dictionaries";

export const PAYROLL_TEACHING_TYPES = TEACHING_TYPE;

export type PayrollTeachingType = TeachingType;

export type PayrollRateRule = {
  defaultRate: number;
  editable: boolean;
};

export function normalizePayrollTeachingType(
  actualTeachingType: string | null | undefined,
): PayrollTeachingType {
  if (actualTeachingType === "资源推送") return "推送资源";
  if (actualTeachingType === "公共") return "公共课直播";
  return (PAYROLL_TEACHING_TYPES as readonly string[]).includes(actualTeachingType ?? "")
    ? (actualTeachingType as PayrollTeachingType)
    : "其他";
}

export function getPayrollRateRule(
  billingType: string | null | undefined,
  teachingType: PayrollTeachingType,
): PayrollRateRule {
  if (billingType === "总包") return { defaultRate: 0, editable: false };
  if (teachingType === "分发录播" || teachingType === "推送资源") {
    return { defaultRate: 0, editable: true };
  }
  if (teachingType === "外包") return { defaultRate: 0, editable: false };
  return { defaultRate: 120, editable: true };
}

export function roundPayrollAmount(value: number): number {
  return Math.round(value / 10) * 10;
}
