// apps/api/src/modules/students/utils/grade.ts

/**
 * spec §6: grade is derived from enrollmentYear / graduationYear / today.
 * Academic-year boundary: September 1. July 1 counts as graduation month.
 *
 * Returned value matches the GRADE_VALUES dictionary plus `null` for
 * "not-yet-enrolled" rows (e.g. 2026 enrollees queried in 2026-04).
 */
export function calculateGrade(
  enrollmentYear: number | null,
  graduationYear: number | null,
  now: Date = new Date(),
): string | null {
  if (enrollmentYear == null || graduationYear == null) return null;

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1..12

  // Graduation first — if the student's graduation year has passed (or is
  // the current year and we're past July), they are done.
  if (currentYear > graduationYear) return "已毕业";
  if (currentYear === graduationYear && currentMonth >= 7) return "已毕业";

  const academicYear =
    currentMonth >= 9
      ? currentYear - enrollmentYear + 1
      : currentYear - enrollmentYear;

  if (academicYear < 1) return null;
  // spec §3.3.2: emoji 后缀标记急迫感
  if (academicYear >= 5) return "大五❗❗";
  if (academicYear === 4) return "大四❗❗";
  if (academicYear === 3) return "大三❗";
  if (academicYear === 2) return "大二❕";
  return "大一";
}

/**
 * SQL fragment that returns a string grade label given a Student row.
 * Identical logic to `calculateGrade`; used in `$queryRaw` CTEs so
 * filter (`WHERE s.grade_text = '大三'`) and display share one source.
 */
export const GRADE_TEXT_CASE_SQL = `
  CASE
    WHEN "enrollmentYear" IS NULL OR "graduationYear" IS NULL THEN NULL
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::int > "graduationYear" THEN '已毕业'
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::int = "graduationYear" AND EXTRACT(MONTH FROM CURRENT_DATE) >= 7 THEN '已毕业'
    WHEN (CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" + 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" END) < 1 THEN NULL
    WHEN (CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" + 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" END) >= 5 THEN '大五❗❗'
    WHEN (CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" + 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" END) = 4 THEN '大四❗❗'
    WHEN (CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" + 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" END) = 3 THEN '大三❗'
    WHEN (CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" + 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" END) = 2 THEN '大二❕'
    ELSE '大一'
  END
`;

/**
 * SQL fragment that returns a numeric rank for ORDER BY.
 * spec §4.3 second priority: 大五(0) > 大四(1) > 大三(2) > 大二(3) > 大一(4); 已毕业(5)
 */
export const GRADE_SORT_SQL = `
  CASE
    WHEN "enrollmentYear" IS NULL OR "graduationYear" IS NULL THEN 999
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::int > "graduationYear" THEN 5
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::int = "graduationYear" AND EXTRACT(MONTH FROM CURRENT_DATE) >= 7 THEN 5
    WHEN (CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" + 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" END) >= 5 THEN 0
    WHEN (CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" + 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" END) = 4 THEN 1
    WHEN (CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" + 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" END) = 3 THEN 2
    WHEN (CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" + 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" END) = 2 THEN 3
    ELSE 4
  END
`;

/** Format: `YYNNNN` where YY = enrollmentYear % 100, NNNN zero-padded 4 digits. */
export function formatStudentNo(enrollmentYear: number, seq: number): string {
  const yy = String(enrollmentYear % 100).padStart(2, "0");
  const nnnn = String(seq).padStart(4, "0");
  return `${yy}${nnnn}`;
}
