// apps/api/src/modules/students/students-import.service.ts
import { Injectable } from "@nestjs/common";

import { Prisma } from "@prisma/client";

import ExcelJS from "exceljs";

import { IdSequenceService } from "../../common/id-sequence/id-sequence.service";

import {

  GENDER,

  SERVICE_PLATFORM,

  SERVICE_STATUS_BY_LABEL,

  SERVICE_STATUS_LABELS,

  STUDENT_SOURCE,

} from "../../common/dictionaries";

import { buildExportWorkbook, type ExportColumn } from "../../common/export/export-utils";

import { AuditLogsService } from "../audit-logs/audit-logs.service";

import { PrismaService } from "../../prisma/prisma.service";

import { StorageService } from "../storage/storage.service";

import type { ImportError, ImportReport, ImportCommitResult } from "./students.types";

import { formatStudentNo } from "./utils/grade";

/** Column order must match `generateTemplate` below. */
const COLUMNS = [
  "name",
  "gender",
  "enrollmentYear",
  "graduationYear",
  "school",
  "major",
  "phone",
  "servicePlatform",
  "source",
  "serviceStatusLabel",
  "serviceChecklistUrl",
  "overallPlanUrl",
  "planningRequirementDetail",
  "gpaEnglishDetail",
  "researchDetail",
  "innovationProjectDetail",
  "competitionDetail",
  "paperDetail",
  "patentSoftwareDetail",
  "otherServiceDetail",
  "giftedServiceDetail",
  "policyText",
  "counselorJobNo",
  "plannerJobNo",
  "email",
  "totalPublicCredits",
  "totalPrivateCredits",
  "remainingPublicCredits",
  "remainingPrivateCredits",
  "note",
] as const;

type Col = (typeof COLUMNS)[number];

const COLUMN_HEADERS: Record<Col, string> = {
  name: "学生姓名",
  gender: "性别",
  enrollmentYear: "入学年份",
  graduationYear: "毕业年份",
  school: "所在院校",
  major: "所在专业",
  phone: "电话号码",
  servicePlatform: "服务群所在平台",
  source: "学生来源",
  serviceStatusLabel: "服务状态",
  serviceChecklistUrl: "服务清单（链接）",
  overallPlanUrl: "总规划（链接）",
  planningRequirementDetail: "规划要求详情",
  gpaEnglishDetail: "GPA+英语提升服务项详情",
  researchDetail: "科研赋能服务项详情",
  innovationProjectDetail: "大创项目服务详情",
  competitionDetail: "竞赛培训服务详情",
  paperDetail: "论文辅导服务详情",
  patentSoftwareDetail: "专利、软著服务详情",
  otherServiceDetail: "其他类型服务详情",
  giftedServiceDetail: "赠送服务详情",
  policyText: "保研申请要求",
  counselorJobNo: "学管老师工号",
  plannerJobNo: "规划师工号",
  email: "邮箱",
  totalPublicCredits: "公共课总课时",
  totalPrivateCredits: "1v1总课时",
  remainingPublicCredits: "公共课剩余",
  remainingPrivateCredits: "1v1剩余",
  note: "备注",
};

const COLUMN_HEADER_ALIASES: Record<Col, readonly string[]> = {
  name: ["学生姓名", "姓名"],
  gender: ["性别"],
  enrollmentYear: ["入学年份"],
  graduationYear: ["毕业年份"],
  school: ["所在院校", "学校"],
  major: ["所在专业", "专业"],
  phone: ["电话号码", "电话"],
  servicePlatform: ["服务群所在平台", "服务平台"],
  source: ["学生来源"],
  serviceStatusLabel: ["服务状态"],
  serviceChecklistUrl: ["服务清单（链接）", "服务清单(链接)"],
  overallPlanUrl: ["总规划（链接）", "总规划(链接)"],
  planningRequirementDetail: ["规划要求详情"],
  gpaEnglishDetail: ["GPA+英语提升服务项详情"],
  researchDetail: ["科研赋能服务项详情"],
  innovationProjectDetail: ["大创项目服务详情"],
  competitionDetail: ["竞赛培训服务详情"],
  paperDetail: ["论文辅导服务详情"],
  patentSoftwareDetail: ["专利、软著服务详情"],
  otherServiceDetail: ["其他类型服务详情"],
  giftedServiceDetail: ["赠送服务详情"],
  policyText: ["保研申请要求"],
  counselorJobNo: ["学管老师工号"],
  plannerJobNo: ["规划师工号"],
  email: ["邮箱"],
  totalPublicCredits: ["公共课总课时"],
  totalPrivateCredits: ["1v1总课时"],
  remainingPublicCredits: ["公共课剩余"],
  remainingPrivateCredits: ["1v1剩余"],
  note: ["备注"],
};

const REQUIRED_COLUMNS: Col[] = ["name", "gender", "enrollmentYear", "graduationYear"];

type ParsedRow = {
  row: number; // 1-based row in spreadsheet (header = row 1)
  name: string;
  gender: string;
  enrollmentYear: number | null;
  graduationYear: number | null;
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
  serviceChecklistUrl?: string;
  overallPlanUrl?: string;
  policyText?: string;
  detailNotes?: Record<string, string>;
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

  private static readonly EXPORT_COLUMNS: ExportColumn[] = [
    { header: "学生姓名", key: "name" },
    { header: "性别", key: "gender" },
    { header: "入学年份", key: "enrollmentYear" },
    { header: "毕业年份", key: "graduationYear" },
    { header: "所在院校", key: "school" },
    { header: "所在专业", key: "major" },
    { header: "电话号码", key: "phone" },
    { header: "服务群所在平台", key: "servicePlatform" },
    { header: "学生来源", key: "source" },
    { header: "服务状态", key: "serviceStatus" },
    { header: "学管老师工号", key: "counselorJobNo" },
    { header: "规划师工号", key: "plannerJobNo" },
    { header: "邮箱", key: "email" },
    { header: "公共课总课时", key: "totalPublicCredits" },
    { header: "1v1总课时", key: "totalPrivateCredits" },
    { header: "公共课剩余", key: "remainingPublicCredits" },
    { header: "1v1剩余", key: "remainingPrivateCredits" },
    { header: "服务清单（下载链接）", key: "serviceChecklistKeys" },
    { header: "课表（下载链接）", key: "scheduleKeys" },
    { header: "成绩单（下载链接）", key: "transcriptKeys" },
    { header: "附件（下载链接）", key: "attachmentKeys" },
    { header: "备注", key: "note" },
  ];

  /** Export all Student records as an Excel workbook buffer. */
  async exportAll(): Promise<Buffer> {
    const students = await this.prisma.student.findMany({
      orderBy: { studentNo: "asc" },
    });

    const rows = await Promise.all(
      students.map(async (stu) => {
        const [signedChecklists, signedSchedules, signedTranscripts, signedAttachments] =
          await Promise.all([
            stu.serviceChecklistKeys.length > 0
              ? Promise.all(
                  stu.serviceChecklistKeys.map((key) => this.storage.signDownload(key, 3600)),
                )
              : Promise.resolve([] as string[]),
            stu.scheduleKeys.length > 0
              ? Promise.all(
                  stu.scheduleKeys.map((key) => this.storage.signDownload(key, 3600)),
                )
              : Promise.resolve([] as string[]),
            stu.transcriptKeys.length > 0
              ? Promise.all(
                  stu.transcriptKeys.map((key) => this.storage.signDownload(key, 3600)),
                )
              : Promise.resolve([] as string[]),
            stu.attachmentKeys.length > 0
              ? Promise.all(
                  stu.attachmentKeys.map((key) => this.storage.signDownload(key, 3600)),
                )
              : Promise.resolve([] as string[]),
          ]);

        return {
          name: stu.name ?? "",
          gender: stu.gender ?? "",
          enrollmentYear: stu.enrollmentYear ?? "",
          graduationYear: stu.graduationYear ?? "",
          school: stu.school ?? "",
          major: stu.major ?? "",
          phone: stu.phone ?? "",
          servicePlatform: stu.servicePlatform ?? "",
          source: stu.source ?? "",
          serviceStatus: stu.serviceStatus
            ? SERVICE_STATUS_LABELS[stu.serviceStatus]
            : "",
          counselorJobNo: stu.counselorJobNo ?? "",
          plannerJobNo: stu.plannerJobNo ?? "",
          email: stu.email ?? "",
          totalPublicCredits:
            stu.totalPublicCredits != null ? Number(stu.totalPublicCredits) : "",
          totalPrivateCredits:
            stu.totalPrivateCredits != null ? Number(stu.totalPrivateCredits) : "",
          remainingPublicCredits:
            stu.remainingPublicCredits != null ? Number(stu.remainingPublicCredits) : "",
          remainingPrivateCredits:
            stu.remainingPrivateCredits != null ? Number(stu.remainingPrivateCredits) : "",
          serviceChecklistKeys: signedChecklists.join("；"),
          scheduleKeys: signedSchedules.join("；"),
          transcriptKeys: signedTranscripts.join("；"),
          attachmentKeys: signedAttachments.join("；"),
          note: stu.note ?? "",
        };
      }),
    );

    return buildExportWorkbook(StudentsImportService.EXPORT_COLUMNS, rows);
  }

  async generateTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("学生导入");
    ws.columns = COLUMNS.map((key) => ({ header: COLUMN_HEADERS[key], key, width: 18 }));
    ws.getRow(1).font = { bold: true };
    // One example row demonstrating valid values; the user replaces or deletes it before upload.
    ws.addRow({
      name: "张三",
      gender: "男",
      enrollmentYear: 2023,
      graduationYear: 2027,
      school: "清华大学",
      major: "计算机科学与技术",
      phone: "13800138000",
      servicePlatform: "企业微信",
      source: "自营（保研）",
      serviceStatusLabel: "未开始",
      serviceChecklistUrl: "",
      overallPlanUrl: "",
      policyText: "",
    });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private async fetchFile(fileKey: string): Promise<Buffer> {
    const url = await this.storage.signDownload(fileKey, 60);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`读取导入文件失败: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  private cellToString(value: ExcelJS.CellValue): string {
    if (value == null) return "";
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === "object" && "text" in value) return String(value.text ?? "").trim();
    if (typeof value === "object" && "result" in value) return String(value.result ?? "").trim();
    return String(value).trim();
  }

  private blankToUndefined(value?: string): string | undefined {
    if (!value || value === "——") return undefined;
    return value;
  }

  private parseOptionalYear(value?: string): number | null {
    const normalized = this.blankToUndefined(value);
    return normalized === undefined ? null : Number(normalized);
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
    const headerMap = new Map<number, Col>();
    headerRow.eachCell((cell, colNumber) => {
      const headerText = this.cellToString(cell.value);
      const matched = COLUMNS.find((key) => COLUMN_HEADER_ALIASES[key].includes(headerText));
      if (matched) headerMap.set(colNumber, matched);
    });
    const present = new Set(headerMap.values());
    const missing = REQUIRED_COLUMNS.filter((key) => !present.has(key));
    if (missing.length > 0) {
      headerErrors.push({
        row: 1,
        field: "header",
        message: `缺少列：${missing.map((key) => COLUMN_HEADERS[key]).join("、")}`,
      });
    }

    const rows: ParsedRow[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const raw: Partial<Record<Col, string>> = {};
      let hasAny = false;
      headerMap.forEach((key, colNumber) => {
        const value = this.cellToString(row.getCell(colNumber).value);
        if (value !== "") {
          raw[key] = value;
          hasAny = true;
        }
      });
      if (!hasAny) return;

      const detailNotes = Object.fromEntries(
        ([
          "planningRequirementDetail",
          "gpaEnglishDetail",
          "researchDetail",
          "innovationProjectDetail",
          "competitionDetail",
          "paperDetail",
          "patentSoftwareDetail",
          "otherServiceDetail",
          "giftedServiceDetail",
        ] as const)
          .map((key) => [COLUMN_HEADERS[key], this.blankToUndefined(raw[key])])
          .filter((entry): entry is [string, string] => Boolean(entry[1])),
      );

      rows.push({
        row: rowNumber,
        name: raw.name ?? "",
        gender: raw.gender ?? "",
        enrollmentYear: this.parseOptionalYear(raw.enrollmentYear),
        graduationYear: this.parseOptionalYear(raw.graduationYear),
        school: this.blankToUndefined(raw.school),
        major: this.blankToUndefined(raw.major),
        counselorJobNo: this.blankToUndefined(raw.counselorJobNo),
        plannerJobNo: this.blankToUndefined(raw.plannerJobNo),
        servicePlatform: raw.servicePlatform ?? "",
        source: raw.source ?? "",
        serviceStatusLabel: raw.serviceStatusLabel ?? "",
        phone: this.blankToUndefined(raw.phone),
        email: this.blankToUndefined(raw.email),
        totalPublicCredits: this.blankToUndefined(raw.totalPublicCredits),
        totalPrivateCredits: this.blankToUndefined(raw.totalPrivateCredits),
        remainingPublicCredits: this.blankToUndefined(raw.remainingPublicCredits),
        remainingPrivateCredits: this.blankToUndefined(raw.remainingPrivateCredits),
        serviceChecklistUrl: this.blankToUndefined(raw.serviceChecklistUrl),
        overallPlanUrl: this.blankToUndefined(raw.overallPlanUrl),
        policyText: this.blankToUndefined(raw.policyText),
        detailNotes: Object.keys(detailNotes).length > 0 ? detailNotes : undefined,
        note: this.blankToUndefined(raw.note),
      });
    });
    return { rows, headerErrors };
  }

  private async validateRow(r: ParsedRow): Promise<ImportError[]> {
    const errs: ImportError[] = [];

    const push = (field: string, message: string) => errs.push({ row: r.row, field, message });



    // Required field check

    if (!r.name) push("学生姓名", "必填");

    if (!r.gender) push("性别", "必填");

    if (r.enrollmentYear == null) push("入学年份", "必填");

    if (r.graduationYear == null) push("毕业年份", "必填");



    if (r.gender && !GENDER.includes(r.gender as typeof GENDER[number])) push("性别", `非法值 "${r.gender}"，仅支持 ${GENDER.join("/")}`);

    if (r.enrollmentYear !== null && (!Number.isInteger(r.enrollmentYear) || r.enrollmentYear < 2000 || r.enrollmentYear > 2100)) {
      push("入学年份", `非法值 "${r.enrollmentYear}"`);
    }
    if (r.graduationYear !== null && (!Number.isInteger(r.graduationYear) || r.graduationYear < 2000 || r.graduationYear > 2100)) {
      push("毕业年份", `非法值 "${r.graduationYear}"`);
    } else if (r.enrollmentYear !== null && r.graduationYear !== null && r.graduationYear < r.enrollmentYear) {
      push("毕业年份", `必须不早于入学年份 ${r.enrollmentYear}`);
    } else if (r.enrollmentYear !== null && r.graduationYear !== null && r.graduationYear > r.enrollmentYear + 10) {
      push("毕业年份", `学制过长（>10 年）：${r.enrollmentYear}-${r.graduationYear}`);
    }

    if (r.servicePlatform && !SERVICE_PLATFORM.includes(r.servicePlatform as typeof SERVICE_PLATFORM[number])) {
      push("服务群所在平台", `非法值 "${r.servicePlatform}"`);
    }
    if (r.source && !STUDENT_SOURCE.includes(r.source as typeof STUDENT_SOURCE[number])) {
      push("学生来源", `非法值 "${r.source}"`);
    }
    if (r.serviceStatusLabel && !SERVICE_STATUS_BY_LABEL[r.serviceStatusLabel]) {
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

    // Group rows by enrollmentYear when present; otherwise use current year
    // only for studentNo allocation while keeping the stored field empty.
    const byYear = new Map<number, ParsedRow[]>();
    const fallbackYear = new Date().getFullYear();
    for (const r of rows) {
      const sequenceYear = r.enrollmentYear ?? fallbackYear;
      const arr = byYear.get(sequenceYear) ?? [];
      arr.push(r);
      byYear.set(sequenceYear, arr);
    }
    const rowToSeq = new Map<number, number>();
    for (const [year, group] of byYear.entries()) {
      const seqs = await this.idSequence.allocateBatch("student", year, group.length);
      group.forEach((r, idx) => rowToSeq.set(r.row, seqs[idx]));
    }

    const dataRows: Prisma.StudentCreateManyInput[] = rows.map((r) => {
      const seq = rowToSeq.get(r.row)!;
      const sequenceYear = r.enrollmentYear ?? fallbackYear;
      const studentNo = formatStudentNo(sequenceYear, seq);
      return {
        studentNo,
        name: r.name || null,
        gender: r.gender || null,
        enrollmentYear: r.enrollmentYear,
        graduationYear: r.graduationYear,
        school: r.school || null,
        major: r.major || null,
        counselorJobNo: r.counselorJobNo || null,
        plannerJobNo: r.plannerJobNo || null,
        phone: r.phone || null,
        email: r.email || null,
        servicePlatform: r.servicePlatform || null,
        source: r.source || null,
        serviceStatus: r.serviceStatusLabel ? SERVICE_STATUS_BY_LABEL[r.serviceStatusLabel]! : null,
        serviceChecklistUrl: r.serviceChecklistUrl || null,
        overallPlanUrl: r.overallPlanUrl || null,
        policyText: r.policyText || null,
        detailNotes: r.detailNotes === undefined ? Prisma.JsonNull : r.detailNotes,
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
