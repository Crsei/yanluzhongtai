/**
 * `YYYYMM` period string utilities (spec §5 所属年月 / §9.2 / 设计 §4.1).
 *
 * All functions are pure so they can be reused by services, DTOs, and unit
 * tests without a Nest DI context.
 */

export type PeriodParts = { year: number; month: number };

export function formatPeriod(year: number, month: number): string {
  if (month < 1 || month > 12) {
    throw new Error(`月份非法: ${month}`);
  }
  return `${year}${String(month).padStart(2, "0")}`;
}

export function parsePeriod(period: string): PeriodParts | null {
  if (!/^\d{6}$/.test(period)) return null;
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(4, 6));
  if (year < 1900 || year > 2100 || month < 1 || month > 12) return null;
  return { year, month };
}

/** "本月" 快捷 — based on local machine time at call site. */
export function currentMonthPeriod(now: Date = new Date()): string {
  return formatPeriod(now.getFullYear(), now.getMonth() + 1);
}

/** "上月" 快捷. */
export function previousMonthPeriod(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return formatPeriod(d.getFullYear(), d.getMonth() + 1);
}

/** Expand an inclusive range [from, to] of `YYYYMM` into a consecutive list. */
export function periodRangeToList(from: string, to: string): string[] {
  const a = parsePeriod(from);
  const b = parsePeriod(to);
  if (!a || !b) {
    throw new Error(`period 范围格式非法: ${from}-${to}`);
  }
  if (b.year < a.year || (b.year === a.year && b.month < a.month)) {
    throw new Error(`开始月份不能晚于结束月份: ${from}-${to}`);
  }
  const result: string[] = [];
  let y = a.year;
  let m = a.month;
  while (y < b.year || (y === b.year && m <= b.month)) {
    result.push(formatPeriod(y, m));
    m += 1;
    if (m > 12) {
      y += 1;
      m = 1;
    }
    if (result.length > 36) {
      throw new Error("period 区间超过 36 个月,拒绝");
    }
  }
  return result;
}

/**
 * Return a UTC `[start, end)` window covering the given YYYYMM.
 * Used as a Prisma `gte` / `lt` filter against the `plannedAt` DateTime column.
 * The project deploys in Asia/Shanghai (UTC+8); edge-case midnight courses
 * may be off by one month — deferred per design §9.
 */
export function periodBounds(period: string): { start: Date; end: Date } {
  const parts = parsePeriod(period);
  if (!parts) {
    throw new Error(`period 格式非法: ${period}`);
  }
  const start = new Date(Date.UTC(parts.year, parts.month - 1, 1));
  const end = new Date(Date.UTC(parts.year, parts.month, 1));
  return { start, end };
}
