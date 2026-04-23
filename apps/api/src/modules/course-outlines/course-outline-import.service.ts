import { Injectable, NotFoundException } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import { TEACHING_TYPE, TeachingType } from "../../common/dictionaries";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import type {
  ImportRowError,
  OutlineImportCommitResult,
  OutlineImportReport,
} from "./course-outlines.types";

const COLUMNS = [
  "sectionCode",
  "sectionName",
  "sectionDisplayOrder",
  "sequenceNo",
  "secondaryCategoryName",
  "suggestedTeachingType",
  "plannedTeacherJobNo",
  "lessonPlanUrl",
] as const;

type Col = (typeof COLUMNS)[number];

const COLUMN_HEADERS: Record<Col, string> = {
  sectionCode: "板块代码",
  sectionName: "板块名称",
  sectionDisplayOrder: "板块排序",
  sequenceNo: "序列号",
  secondaryCategoryName: "二级课程类别名称",
  suggestedTeachingType: "建议授课方式",
  plannedTeacherJobNo: "计划授课老师工号",
  lessonPlanUrl: "教案排期链接",
};

const REQUIRED_COLUMNS: Col[] = [
  "sectionCode",
  "sectionName",
  "sequenceNo",
  "secondaryCategoryName",
  "suggestedTeachingType",
];

type ParsedRow = {
  rowNumber: number;
  raw: Partial<Record<Col, string>>;
};

type ValidatedRow = {
  rowNumber: number;
  sectionCode: string;
  sectionName: string;
  sectionDisplayOrder: number | null;
  sequenceNo: string;
  secondaryCategoryName: string;
  suggestedTeachingType: TeachingType;
  plannedTeacherJobNo: string | null;
  lessonPlanUrl: string | null;
};

@Injectable()
export class CourseOutlineImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  /** Build the blank .xlsx template at request time — no file checked into git. */
  async generateTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("课程大纲导入");
    sheet.columns = COLUMNS.map((key) => ({
      header: COLUMN_HEADERS[key],
      key,
      width: 20,
    }));

    sheet.addRow({
      sectionCode: "GP",
      sectionName: "GPA提升",
      sectionDisplayOrder: 1,
      sequenceNo: "01",
      secondaryCategoryName: "微积分一对一",
      suggestedTeachingType: "1v1",
      plannedTeacherJobNo: "26001",
      lessonPlanUrl: "https://example.com/plan/gp-01",
    });

    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async dryRun(versionId: string, fileKey: string): Promise<OutlineImportReport> {
    const version = await this.prisma.courseOutlineVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException("大纲版本不存在");

    const buffer = await this.storage.readObject(fileKey);
    const parsed = await this.parse(buffer);
    if (parsed.errors.length > 0) {
      return {
        totalRows: parsed.rows.length,
        validRows: 0,
        uniqueSections: 0,
        errors: parsed.errors,
      };
    }

    const validated = await this.validate(parsed.rows);
    return {
      totalRows: parsed.rows.length,
      validRows: validated.rows.length,
      uniqueSections: new Set(validated.rows.map((r) => r.sectionCode)).size,
      errors: validated.errors,
    };
  }

  async commit(
    versionId: string,
    fileKey: string,
    operatorId: string,
  ): Promise<OutlineImportCommitResult> {
    const version = await this.prisma.courseOutlineVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException("大纲版本不存在");

    const buffer = await this.storage.readObject(fileKey);
    const parsed = await this.parse(buffer);
    if (parsed.errors.length > 0) {
      return { createdSections: 0, createdItems: 0, errors: parsed.errors };
    }

    const validated = await this.validate(parsed.rows);
    if (validated.errors.length > 0) {
      return { createdSections: 0, createdItems: 0, errors: validated.errors };
    }

    // Build deduped section list preserving first-seen order.
    const sectionsByCode = new Map<
      string,
      { name: string; displayOrder: number }
    >();
    let nextAutoOrder = 1;
    for (const row of validated.rows) {
      if (!sectionsByCode.has(row.sectionCode)) {
        sectionsByCode.set(row.sectionCode, {
          name: row.sectionName,
          displayOrder: row.sectionDisplayOrder ?? nextAutoOrder,
        });
        nextAutoOrder += 1;
      }
    }

    const sectionRows = Array.from(sectionsByCode.entries()).map(([code, meta]) => ({
      outlineVersionId: versionId,
      code,
      name: meta.name,
      displayOrder: meta.displayOrder,
    }));

    const itemRows = validated.rows.map((row) => ({
      outlineVersionId: versionId,
      sectionCode: row.sectionCode,
      sequenceNo: row.sequenceNo,
      secondaryCategoryName: row.secondaryCategoryName,
      suggestedTeachingType: row.suggestedTeachingType,
      plannedTeacherJobNo: row.plannedTeacherJobNo,
      lessonPlanUrl: row.lessonPlanUrl,
    }));

    await this.prisma.$transaction(async (tx) => {
      // Order matters: items reference sections via (outlineVersionId, sectionCode).
      await tx.courseOutlineItem.deleteMany({ where: { outlineVersionId: versionId } });
      await tx.courseSection.deleteMany({ where: { outlineVersionId: versionId } });
      if (sectionRows.length > 0) await tx.courseSection.createMany({ data: sectionRows });
      if (itemRows.length > 0) await tx.courseOutlineItem.createMany({ data: itemRows });
    });

    await this.auditLogs.record({
      operatorId,
      action: "import_overwrite",
      targetType: "course_outline_version",
      targetId: versionId,
      after: {
        sectionCount: sectionRows.length,
        itemCount: itemRows.length,
      },
    });

    return {
      createdSections: sectionRows.length,
      createdItems: itemRows.length,
      errors: [],
    };
  }

  // ------------------------------- internals ------------------------------- //

  private async parse(buffer: Buffer): Promise<{ rows: ParsedRow[]; errors: ImportRowError[] }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return { rows: [], errors: [{ row: 0, field: "header", message: "未找到任何工作表" }] };
    }

    const headerRow = sheet.getRow(1);
    const headerMap = new Map<number, Col>();
    headerRow.eachCell((cell, colNumber) => {
      const headerText = String(cell.value ?? "").trim();
      const matched = COLUMNS.find((k) => COLUMN_HEADERS[k] === headerText);
      if (matched) headerMap.set(colNumber, matched);
    });

    const present = new Set(headerMap.values());
    const missing = REQUIRED_COLUMNS.filter((k) => !present.has(k));
    if (missing.length > 0) {
      return {
        rows: [],
        errors: [
          {
            row: 1,
            field: "header",
            message: `缺少列：${missing.map((k) => COLUMN_HEADERS[k]).join("、")}`,
          },
        ],
      };
    }

    const rows: ParsedRow[] = [];
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const raw: ParsedRow["raw"] = {};
      let hasAny = false;
      headerMap.forEach((key, colNumber) => {
        const value = row.getCell(colNumber).value;
        if (value !== null && value !== undefined && String(value).trim() !== "") {
          raw[key] = String(value).trim();
          hasAny = true;
        }
      });
      if (hasAny) rows.push({ rowNumber: r, raw });
    }
    return { rows, errors: [] };
  }

  private async validate(
    rows: ParsedRow[],
  ): Promise<{ rows: ValidatedRow[]; errors: ImportRowError[] }> {
    const errors: ImportRowError[] = [];
    const valid: ValidatedRow[] = [];

    const teacherJobNos = new Set<string>();
    for (const { raw } of rows) {
      if (raw.plannedTeacherJobNo) teacherJobNos.add(raw.plannedTeacherJobNo);
    }
    const teachers = teacherJobNos.size
      ? await this.prisma.employee.findMany({
          where: { jobNo: { in: [...teacherJobNos] } },
          select: { jobNo: true, employmentStatus: true },
        })
      : [];
    const teacherMap = new Map(teachers.map((t) => [t.jobNo, t]));

    const sectionNameByCode = new Map<string, string>();
    const seenKeys = new Set<string>();

    for (const { rowNumber, raw } of rows) {
      const rowErrors: ImportRowError[] = [];

      for (const key of REQUIRED_COLUMNS) {
        if (!raw[key]) rowErrors.push({ row: rowNumber, field: COLUMN_HEADERS[key], message: "必填" });
      }

      const sectionCode = raw.sectionCode ?? "";
      if (sectionCode && !/^[A-Z]{2}$/.test(sectionCode)) {
        rowErrors.push({ row: rowNumber, field: "板块代码", message: "需为两位大写字母" });
      }

      const sectionName = raw.sectionName ?? "";
      if (sectionCode && sectionName) {
        const existingName = sectionNameByCode.get(sectionCode);
        if (existingName === undefined) {
          sectionNameByCode.set(sectionCode, sectionName);
        } else if (existingName !== sectionName) {
          rowErrors.push({
            row: rowNumber,
            field: "板块名称",
            message: `板块 ${sectionCode} 名称不一致: ${existingName} vs ${sectionName}`,
          });
        }
      }

      let sectionDisplayOrder: number | null = null;
      if (raw.sectionDisplayOrder) {
        const n = Number(raw.sectionDisplayOrder);
        if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
          rowErrors.push({ row: rowNumber, field: "板块排序", message: "需为非负整数" });
        } else {
          sectionDisplayOrder = n;
        }
      }

      let sequenceNo = "";
      if (raw.sequenceNo) {
        if (!/^\d{1,2}$/.test(raw.sequenceNo)) {
          rowErrors.push({ row: rowNumber, field: "序列号", message: "需为 1-2 位数字" });
        } else {
          const seqNum = Number(raw.sequenceNo);
          if (seqNum < 1 || seqNum > 99) {
            rowErrors.push({ row: rowNumber, field: "序列号", message: "取值需在 1-99 之间" });
          } else {
            sequenceNo = String(seqNum).padStart(2, "0");
          }
        }
      }

      if (
        raw.suggestedTeachingType &&
        !(TEACHING_TYPE as readonly string[]).includes(raw.suggestedTeachingType)
      ) {
        rowErrors.push({
          row: rowNumber,
          field: "建议授课方式",
          message: `非法值，仅支持 ${TEACHING_TYPE.join("/")}`,
        });
      }

      if (raw.plannedTeacherJobNo) {
        const t = teacherMap.get(raw.plannedTeacherJobNo);
        if (!t) {
          rowErrors.push({
            row: rowNumber,
            field: "计划授课老师工号",
            message: `员工 ${raw.plannedTeacherJobNo} 不存在`,
          });
        } else if (t.employmentStatus === "RESIGNED") {
          rowErrors.push({
            row: rowNumber,
            field: "计划授课老师工号",
            message: `员工 ${raw.plannedTeacherJobNo} 已离职`,
          });
        }
      }

      if (raw.lessonPlanUrl && !/^https?:\/\//i.test(raw.lessonPlanUrl)) {
        rowErrors.push({ row: rowNumber, field: "教案排期链接", message: "URL 需以 http(s):// 开头" });
      }

      if (sectionCode && sequenceNo) {
        const key = `${sectionCode}|${sequenceNo}`;
        if (seenKeys.has(key)) {
          rowErrors.push({
            row: rowNumber,
            field: "序列号",
            message: `板块 ${sectionCode} 下序列号 ${sequenceNo} 在模板内重复`,
          });
        } else {
          seenKeys.add(key);
        }
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        continue;
      }

      valid.push({
        rowNumber,
        sectionCode,
        sectionName,
        sectionDisplayOrder,
        sequenceNo,
        secondaryCategoryName: raw.secondaryCategoryName!,
        suggestedTeachingType: raw.suggestedTeachingType as TeachingType,
        plannedTeacherJobNo: raw.plannedTeacherJobNo ?? null,
        lessonPlanUrl: raw.lessonPlanUrl ?? null,
      });
    }

    return { rows: valid, errors };
  }
}
