/**
 * TTKKYYNNN composite identifier for Course records (spec §4.2 / §8).
 *
 *  - TT  2 uppercase letters (course section code)
 *  - KK  2 digits (category sequence number inside the section)
 *  - YY  2 digits (year; decided once at creation — spec-literal §8 uses
 *        plannedAt.year, we fall back to currentYear when plannedAt is
 *        null so the un-scheduled record still has a stable number)
 *  - NNN 3 digits (independent running sequence per TT+KK+YY)
 */

export type CourseNoParts = {
  tt: string;
  kk: string;
  yy: string;
  nnn: string;
};

export function normalizeTt(sectionCode: string): string {
  const cleaned = sectionCode.trim().toUpperCase();
  if (!/^[A-Z]{1,2}$/.test(cleaned)) {
    throw new Error(`板块代码需为 1-2 位字母: ${sectionCode}`);
  }
  return cleaned.padStart(2, "X");
}

export function normalizeKk(sequenceNo: string): string {
  const raw = sequenceNo.trim();
  if (!/^\d{1,2}$/.test(raw)) {
    throw new Error(`类别序号需为 1-2 位数字: ${sequenceNo}`);
  }
  const n = Number(raw);
  if (n < 1 || n > 99) {
    throw new Error(`类别序号取值需在 1-99 之间: ${sequenceNo}`);
  }
  return String(n).padStart(2, "0");
}

export function deriveYy(
  plannedAt: Date | null | undefined,
  now: Date = new Date(),
): { yy: string; year: number } {
  const year = plannedAt ? plannedAt.getFullYear() : now.getFullYear();
  return { yy: String(year).slice(-2).padStart(2, "0"), year };
}

export function formatNnn(seq: number): string {
  if (seq < 1 || seq > 999) {
    throw new Error(`课程流水号 ${seq} 超出 1-999 范围`);
  }
  return String(seq).padStart(3, "0");
}

export function formatCourseNo(parts: CourseNoParts): string {
  return `${parts.tt}${parts.kk}${parts.yy}${parts.nnn}`;
}

/** IdSequence kind for the per-(TT,KK,YY) scope. The table's `year` column
 *  still holds the numeric year for readability; the compound `kind` string
 *  holds TT+KK so separate categories in the same year don't collide. */
export function composeCourseSeqKind(tt: string, kk: string): `course:${string}` {
  return `course:${tt}${kk}`;
}
