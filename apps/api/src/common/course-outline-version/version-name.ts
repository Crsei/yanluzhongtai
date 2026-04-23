// apps/api/src/common/course-outline-version/version-name.ts

export const VERSION_NAME_PREFIX = "课程大纲-";

export type ParsedVersion = { year: number; letter: string };

/**
 * Parse names like "课程大纲-24A" into { year: 2024, letter: "A" }.
 * Returns null when the input does not match the canonical format.
 */
export function parseVersionName(name: string): ParsedVersion | null {
  const m = /^课程大纲-(\d{2})([A-Z])$/.exec(name);
  if (!m) return null;
  return { year: 2000 + Number(m[1]), letter: m[2] };
}

export function formatVersionName(year: number, letter: string): string {
  const yy = String(year).slice(-2).padStart(2, "0");
  return `${VERSION_NAME_PREFIX}${yy}${letter}`;
}

/**
 * Given the currently-active version (or null when none exists) and the
 * current calendar year, compute the next version name.
 *
 * Rules (§4.1 of the Phase 3 design):
 *   - No active version → {nowYear}A
 *   - active.year < nowYear → {nowYear}A (new year resets the letter)
 *   - active.year === nowYear and letter < 'Z' → letter + 1
 *   - active.year === nowYear and letter === 'Z' → throw (business limit)
 *   - active.year > nowYear (clock skew) → keep advancing letters on active.year
 */
export function computeNextVersionName(
  latest: ParsedVersion | null,
  nowYear: number,
): string {
  if (!latest) return formatVersionName(nowYear, "A");
  if (latest.year < nowYear) return formatVersionName(nowYear, "A");
  if (latest.letter === "Z") {
    throw new Error(`已达 ${latest.year} 年度版本上限(Z),请在下一年度创建`);
  }
  const nextLetter = String.fromCharCode(latest.letter.charCodeAt(0) + 1);
  return formatVersionName(latest.year, nextLetter);
}
