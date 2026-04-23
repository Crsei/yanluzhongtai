export const COURSE_STATUS_CODES = [
  "NOT_SCHEDULED",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
] as const;
export type CourseStatusCode = (typeof COURSE_STATUS_CODES)[number];

export function computeCourseStatus(
  plannedAt: Date | null | undefined,
  durationMinutes: number | null | undefined,
  now: Date = new Date(),
): CourseStatusCode {
  if (!plannedAt) return "NOT_SCHEDULED";
  if (durationMinutes && durationMinutes > 0) return "COMPLETED";
  return plannedAt.getTime() > now.getTime() ? "SCHEDULED" : "IN_PROGRESS";
}

/** 1 课时 = 45min, round to 2 decimals (spec §10). */
export function computeCreditHours(
  durationMinutes: number | null | undefined,
): number | null {
  if (!durationMinutes || durationMinutes <= 0) return null;
  return Math.round((durationMinutes / 45) * 100) / 100;
}
