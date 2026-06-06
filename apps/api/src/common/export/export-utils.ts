import * as ExcelJS from "exceljs";

/** Column definition for shared export workbook builder. */
export interface ExportColumn {
  header: string;
  key: string;
}

/**
 * Convert Prisma Decimal values to JS numbers for ExcelJS compatibility.
 *
 * Prisma Decimal fields (e.g. Student.totalPublicCredits, Course.creditHours,
 * PayrollSettlement.hourlyRate) are returned as Decimal class instances with a
 * `.toNumber()` method. ExcelJS requires native JS numbers. Call this helper
 * in each export service's row mapper for any Decimal-typed field.
 *
 * @example
 *   creditHours: decimalToNumber(course.creditHours),
 *   hourlyRate: decimalToNumber(payroll.hourlyRate),
 */
export function decimalToNumber(value: unknown): number | undefined | null {
  if (value === null || value === undefined) return value as null | undefined;
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  // Fallback for string-formatted decimals or other representations
  return Number(value);
}

/**
 * Build an Excel workbook from column definitions and data rows.
 *
 * Shared across all export services (Employee, Student, Course, Payroll).
 * Features:
 * - Bold header row with frozen first row
 * - Default column width of 24
 * - Returns Buffer suitable for `res.send()`
 */
export async function buildExportWorkbook(
  columns: readonly ExportColumn[],
  rows: readonly Record<string, unknown>[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("导出");

  sheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: 24,
  }));

  for (const row of rows) {
    sheet.addRow(row);
  }

  // Bold header row
  sheet.getRow(1).font = { bold: true };

  // Freeze first row
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
