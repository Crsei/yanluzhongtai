// apps/api/src/modules/students/students-import.service.ts
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { IdSequenceService } from "../../common/id-sequence/id-sequence.service";
import {
  GENDER,
  SERVICE_PLATFORM,
  SERVICE_STATUS_BY_LABEL,
  STUDENT_SOURCE,
} from "../../common/dictionaries";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import type { ImportError, ImportReport, ImportCommitResult } from "./students.types";
import { formatStudentNo } from "./utils/grade";

/** Column order must match `generateTemplate` below. */
const COLUMNS = [
  "姓名",
  "性别",
  "入学年份",
  "毕业年份",
  "学校",
  "专业",
  "学管老师工号",
  "规划师工号",
  "服务平台",
  "学生来源",
  "服务状态",
  "电话",
  "邮箱",
  "公共课总课时",
  "1v1总课时",
  "公共课剩余",
  "1v1剩余",
  "备注",
] as const;

type ParsedRow = {
  row: number; // 1-based row in spreadsheet (header = row 1)
  name: string;
  gender: string;
  enrollmentYear: number;
  graduationYear: number;
  school?: string;
  major?: string;
  counselorJobNo?: string;
  plannerJobNo?: string;
  servicePlatform: string;
  source: string;
  serviceStatusLabel: string;
  phone?: string;
  email?: string;
  totalPublicCredits?: string;
  totalPrivateCredits?: string;
  remainingPublicCredits?: string;
  remainingPrivateCredits?: string;
  note?: string;
};

@Injectable()
export class StudentsImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly idSequence: IdSequenceService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async generateTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("学生导入");
    ws.columns = COLUMNS.map((header) => ({ header, key: header, width: 16 }));
    ws.getRow(1).font = { bold: true };
    // One example row demonstrating valid values; the user replaces or deletes it before upload.
    ws.addRow([
      "张三",
      "男",
      2023,
      2027,
      "清华大学",
      "计算机科学与技术",
      "",
      "",
      "研录保研",
      "转介绍",
      "未开始",
      "13800138000",
      "zhangsan@example.com",
      "",
      "",
      "",
      "",
      "",
    ]);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private async fetchFile(fileKey: string): Promise<Buffer> {
    const url = await this.storage.signDownload(fileKey, 60);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`读取导入文件失败: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  private async parse(buffer: Buffer): Promise<{ rows: ParsedRow[]; headerErrors: ImportError[] }> {
    const wb = new ExcelJS.Workbook();
    // ExcelJS typing expects a plain ArrayBuffer-backed Buffer; cast to sidestep
    // the @types/node Buffer<ArrayBufferLike> mismatch.
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    const headerErrors: ImportError[] = [];
    if (!ws) {
      return { rows: [], headerErrors: [{ row: 0, field: "sheet", message: "文件中没有工作表" }] };
    }

    const headerRow = ws.getRow(1);
    const headerValues = (headerRow.values as (string | undefined)[]).slice(1); // drop leading undefined
    for (let i = 0; i < COLUMNS.length; i++) {
      if ((headerValues[i] ?? "").toString().trim() !== COLUMNS[i]) {
        headerErrors.push({
          row: 1,
          field: `header[${i}]`,
          message: `列标题不匹配：期望 "${COLUMNS[i]}"，实际 "${headerValues[i] ?? ""}"`,
        });
      }
    }

    const rows: ParsedRow[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const v = (i: number): string | undefined => {
        const cell = row.getCell(i + 1).value;
        if (cell == null) return undefined;
        if (typeof cell === "object" && "text" in cell) return String((cell as { text: unknown }).text ?? "").trim();
        return String(cell).trim();
      };

      rows.push({
        row: rowNumber,
        name: v(0) ?? "",
        gender: v(1) ?? "",
        enrollmentYear: Number(v(2)),
        graduationYear: Number(v(3)),
        school: v(4),
        major: v(5),
        counselorJobNo: v(6),
        plannerJobNo: v(7),
        servicePlatform: v(8) ?? "",
        source: v(9) ?? "",
        serviceStatusLabel: v(10) ?? "",
        phone: v(11),
        email: v(12),
        totalPublicCredits: v(13),
        totalPrivateCredits: v(14),
        remainingPublicCredits: v(15),
        remainingPrivateCredits: v(16),
        note: v(17),
      });
    });
    return { rows, headerErrors };
  }

  private async validateRow(r: ParsedRow): Promise<ImportError[]> {
    const errs: ImportError[] = [];
    const push = (field: string, message: string) => errs.push({ row: r.row, field, message });

    if (!r.name) push("姓名", "必填");
    if (!GENDER.includes(r.gender as typeof GENDER[number])) push("性别", `非法值 "${r.gender}"`);

    if (!Number.isInteger(r.enrollmentYear) || r.enrollmentYear < 2000 || r.enrollmentYear > 2100) {
      push("入学年份", `非法值 "${r.enrollmentYear}"`);
    }
    if (!Number.isInteger(r.graduationYear) || r.graduationYear < 2000 || r.graduationYear > 2100) {
      push("毕业年份", `非法值 "${r.graduationYear}"`);
    } else if (r.graduationYear < r.enrollmentYear) {
      push("毕业年份", `必须不早于入学年份 ${r.enrollmentYear}`);
    } else if (r.graduationYear > r.enrollmentYear + 10) {
      push("毕业年份", `学制过长（>10 年）：${r.enrollmentYear}-${r.graduationYear}`);
    }

    if (!SERVICE_PLATFORM.includes(r.servicePlatform as typeof SERVICE_PLATFORM[number])) {
      push("服务平台", `非法值 "${r.servicePlatform}"`);
    }
    if (!STUDENT_SOURCE.includes(r.source as typeof STUDENT_SOURCE[number])) {
      push("学生来源", `非法值 "${r.source}"`);
    }
    if (!SERVICE_STATUS_BY_LABEL[r.serviceStatusLabel]) {
      push(
        "服务状态",
        `非法值 "${r.serviceStatusLabel}"；允许值：${Object.keys(SERVICE_STATUS_BY_LABEL).join(" / ")}`,
      );
    }

    if (r.phone && !/^1[3-9]\d{9}$/.test(r.phone)) push("电话", `格式非法：${r.phone}`);
    if (r.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) push("邮箱", `格式非法：${r.email}`);

    const jobNos = [r.counselorJobNo, r.plannerJobNo].filter(Boolean) as string[];
    if (jobNos.length > 0) {
      const found = await this.prisma.employee.findMany({
        where: { jobNo: { in: jobNos } },
        select: { jobNo: true },
      });
      const foundSet = new Set(found.map((f) => f.jobNo));
      if (r.counselorJobNo && !foundSet.has(r.counselorJobNo)) {
        push("学管老师工号", `员工不存在：${r.counselorJobNo}`);
      }
      if (r.plannerJobNo && !foundSet.has(r.plannerJobNo)) {
        push("规划师工号", `员工不存在：${r.plannerJobNo}`);
      }
    }

    const num = (s?: string) => (s == null || s === "" ? undefined : Number(s));
    const checkNonNeg = (label: string, val?: number) => {
      if (val !== undefined && (!Number.isFinite(val) || val < 0)) {
        push(label, `必须是非负数：${val}`);
      }
    };
    const tpub = num(r.totalPublicCredits);
    const tprv = num(r.totalPrivateCredits);
    const rpub = num(r.remainingPublicCredits);
    const rprv = num(r.remainingPrivateCredits);
    checkNonNeg("公共课总课时", tpub);
    checkNonNeg("1v1总课时", tprv);
    checkNonNeg("公共课剩余", rpub);
    checkNonNeg("1v1剩余", rprv);
    if (tpub !== undefined && rpub !== undefined && rpub > tpub) {
      push("公共课剩余", `剩余课时（${rpub}）大于总课时（${tpub}）`);
    }
    if (tprv !== undefined && rprv !== undefined && rprv > tprv) {
      push("1v1剩余", `剩余课时（${rprv}）大于总课时（${tprv}）`);
    }

    return errs;
  }

  async dryRun(fileKey: string): Promise<ImportReport> {
    const buf = await this.fetchFile(fileKey);
    const { rows, headerErrors } = await this.parse(buf);
    if (headerErrors.length > 0) {
      return { totalRows: rows.length, validRows: 0, errors: headerErrors };
    }
    const errors: ImportError[] = [];
    for (const r of rows) errors.push(...(await this.validateRow(r)));
    const badRows = new Set(errors.map((e) => e.row));
    const validRows = rows.filter((r) => !badRows.has(r.row)).length;
    return { totalRows: rows.length, validRows, errors };
  }

  async commit(fileKey: string, operatorId: string): Promise<ImportCommitResult> {
    const buf = await this.fetchFile(fileKey);
    const { rows, headerErrors } = await this.parse(buf);
    if (headerErrors.length > 0) {
      return { created: 0, errors: headerErrors };
    }
    const errors: ImportError[] = [];
    for (const r of rows) errors.push(...(await this.validateRow(r)));
    if (errors.length > 0) {
      return { created: 0, errors };
    }

    // Group rows by enrollmentYear and allocate sequence blocks.
    const byYear = new Map<number, ParsedRow[]>();
    for (const r of rows) {
      const arr = byYear.get(r.enrollmentYear) ?? [];
      arr.push(r);
      byYear.set(r.enrollmentYear, arr);
    }
    const rowToSeq = new Map<number, number>();
    for (const [year, group] of byYear.entries()) {
      const seqs = await this.idSequence.allocateBatch("student", year, group.length);
      group.forEach((r, idx) => rowToSeq.set(r.row, seqs[idx]));
    }

    const dataRows: Prisma.StudentCreateManyInput[] = rows.map((r) => {
      const seq = rowToSeq.get(r.row)!;
      const studentNo = formatStudentNo(r.enrollmentYear, seq);
      return {
        studentNo,
        name: r.name,
        gender: r.gender,
        enrollmentYear: r.enrollmentYear,
        graduationYear: r.graduationYear,
        school: r.school || null,
        major: r.major || null,
        counselorJobNo: r.counselorJobNo || null,
        plannerJobNo: r.plannerJobNo || null,
        phone: r.phone || null,
        email: r.email || null,
        servicePlatform: r.servicePlatform,
        source: r.source,
        serviceStatus: SERVICE_STATUS_BY_LABEL[r.serviceStatusLabel]!,
        totalPublicCredits: r.totalPublicCredits ? new Prisma.Decimal(r.totalPublicCredits) : null,
        totalPrivateCredits: r.totalPrivateCredits ? new Prisma.Decimal(r.totalPrivateCredits) : null,
        remainingPublicCredits: r.remainingPublicCredits ? new Prisma.Decimal(r.remainingPublicCredits) : null,
        remainingPrivateCredits: r.remainingPrivateCredits ? new Prisma.Decimal(r.remainingPrivateCredits) : null,
        note: r.note || null,
      };
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.student.createMany({ data: dataRows });
    });

    // Audit per-row AFTER the transaction (same trade-off as Phase 1A); fetch
    // back created rows by studentNo to include ids in the audit payload.
    const createdStudents = await this.prisma.student.findMany({
      where: { studentNo: { in: dataRows.map((d) => d.studentNo) } },
    });
    for (const s of createdStudents) {
      await this.auditLogs.record({
        operatorId,
        action: "student.create",
        targetType: "student",
        targetId: s.id,
        before: null,
        after: { ...s, __importBatchKey: fileKey } as unknown as Record<string, unknown>,
      });
    }

    return { created: dataRows.length, errors: [] };
  }
}
