import { Injectable, NotFoundException } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import {
  COURSE_SECTION_CODE_BY_LABEL,
  COURSE_SECTION_CODES,
  COURSE_SECTION_LABELS,
  TEACHING_TYPE,
  TeachingType,
} from "../../common/dictionaries";
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
  plannedTeacherJobNo: "计划授课老师",
  lessonPlanUrl: "教案排期链接",
};

const COLUMN_HEADER_ALIASES: Record<Col, readonly string[]> = {
  sectionCode: ["板块代码"],
  sectionName: ["板块名称"],
  sectionDisplayOrder: ["板块排序"],
  sequenceNo: ["序列号"],
  secondaryCategoryName: ["二级课程类别名称", "二级课程类别"],
  suggestedTeachingType: ["建议授课方式"],
  plannedTeacherJobNo: ["计划授课老师", "计划授课老师工号"],
  lessonPlanUrl: ["教案排期链接"],
};

const REQUIRED_COLUMNS: Col[] = [];

type ParsedRow = {
  rowNumber: number;
  raw: Partial<Record<Col, string>>;
};

type ValidatedRow = {
  rowNumber: number;
  sectionCode: string;
  sectionName: string;
  sectionDisplayOrder: number | null;
  sequenceNo: string | null;
  secondaryCategoryName: string | null;
  suggestedTeachingType: string | null;
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
      plannedTeacherJobNo: "张三",
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

  private cellToString(value: ExcelJS.CellValue): string {
    if (value == null) return "";
    if (typeof value === "object" && "text" in value) return String(value.text ?? "").trim();
    if (typeof value === "object" && "result" in value) return String(value.result ?? "").trim();
    return String(value).trim();
  }

  private parseSectionFromSheetName(sheetName: string): Pick<ParsedRow["raw"], "sectionCode" | "sectionName"> {
    const matched = sheetName.match(/^(.+?)[(（]([A-Z]{2})[)）]$/);
    if (!matched) return {};
    return {
      sectionName: matched[1].trim(),
      sectionCode: matched[2].trim(),
    };
  }

  private async parse(buffer: Buffer): Promise<{ rows: ParsedRow[]; errors: ImportRowError[] }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    if (workbook.worksheets.length === 0) {
      return { rows: [], errors: [{ row: 0, field: "header", message: "未找到任何工作表" }] };
    }

    const rows: ParsedRow[] = [];
    const errors: ImportRowError[] = [];
    for (const sheet of workbook.worksheets) {
      const headerRow = sheet.getRow(1);
      const headerMap = new Map<number, Col>();
      headerRow.eachCell((cell, colNumber) => {
        const headerText = this.cellToString(cell.value);
        const matched = COLUMNS.find((k) => COLUMN_HEADER_ALIASES[k].includes(headerText));
        if (matched) headerMap.set(colNumber, matched);
      });

      const sheetSection = this.parseSectionFromSheetName(sheet.name);
      const present = new Set(headerMap.values());
      const missing = REQUIRED_COLUMNS.filter((k) => !present.has(k));
      if (missing.length > 0) {
        errors.push({
          row: 1,
          field: "header",
          message: `${sheet.name} 缺少列：${missing.map((k) => COLUMN_HEADERS[k]).join("、")}`,
        });
        continue;
      }

      for (let r = 2; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        const raw: ParsedRow["raw"] = { ...sheetSection };
        let hasAny = false;
        headerMap.forEach((key, colNumber) => {
          const value = this.cellToString(row.getCell(colNumber).value);
          if (value !== "") {
            raw[key] = value;
            hasAny = true;
          }
        });
        if (hasAny) rows.push({ rowNumber: r, raw });
      }
    }
    return { rows, errors };
  }

  private async validate(
    rows: ParsedRow[],
  ): Promise<{ rows: ValidatedRow[]; errors: ImportRowError[] }> {
    const errors: ImportRowError[] = [];
    const valid: ValidatedRow[] = [];

    const teacherInputs = new Set<string>();
    for (const { raw } of rows) {
      if (raw.plannedTeacherJobNo) {
        for (const item of raw.plannedTeacherJobNo.split(/[;,，；、]/).map((s) => s.trim()).filter(Boolean)) {
          teacherInputs.add(item);
        }
      }
    }
    const teachers = teacherInputs.size
      ? await this.prisma.employee.findMany({
          where: {
            OR: [
              { jobNo: { in: [...teacherInputs] } },
              { name: { in: [...teacherInputs] } },
            ],
          },
          select: { jobNo: true, name: true, employmentStatus: true },
        })
      : [];
    const teacherByJobNo = new Map(teachers.map((t) => [t.jobNo, t]));
    const teacherByName = new Map(teachers.map((t) => [t.name, t]));

    const sectionNameByCode = new Map<string, string>();
    const seenKeys = new Set<string>();

    for (const { rowNumber, raw } of rows) {
      const rowErrors: ImportRowError[] = [];

      const sectionCode = raw.sectionCode ?? (raw.sectionName ? COURSE_SECTION_CODE_BY_LABEL[raw.sectionName] ?? "" : "");
      if (sectionCode && !(COURSE_SECTION_CODES as readonly string[]).includes(sectionCode)) {
        // spec §2.3.3: 板块代码必须在 12 个预定义枚举内。
        rowErrors.push({
          row: rowNumber,
          field: "板块代码",
          message: `仅支持 ${COURSE_SECTION_CODES.join("/")}`,
        });
      }

      // 若代码是 XX(--请选择--)则不应作为真实板块导入。
      if (sectionCode === "XX") {
        rowErrors.push({
          row: rowNumber,
          field: "板块代码",
          message: "XX 为占位代码,不可用作实际板块",
        });
      }

      // 板块名与代码的对应关系必须与字典一致。
      const expectedName = COURSE_SECTION_LABELS[sectionCode as keyof typeof COURSE_SECTION_LABELS];
      if (
        sectionCode &&
        expectedName &&
        raw.sectionName &&
        raw.sectionName !== expectedName
      ) {
        rowErrors.push({
          row: rowNumber,
          field: "板块名称",
          message: `板块 ${sectionCode} 的名称应为 "${expectedName}"`,
        });
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

      let plannedTeacherJobNo: string | null = null;
      if (raw.plannedTeacherJobNo) {
        for (const item of raw.plannedTeacherJobNo.split(/[;,，；、]/).map((s) => s.trim()).filter(Boolean)) {
          const t = teacherByJobNo.get(item) ?? teacherByName.get(item);
          if (!t) {
            rowErrors.push({
              row: rowNumber,
              field: "计划授课老师",
              message: `员工 ${item} 不存在`,
            });
          } else if (t.employmentStatus === "RESIGNED") {
            rowErrors.push({
              row: rowNumber,
              field: "计划授课老师",
              message: `员工 ${item} 已离职`,
            });
          } else if (!plannedTeacherJobNo) {
            plannedTeacherJobNo = t.jobNo;
          }
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
        sequenceNo: sequenceNo || null,
        secondaryCategoryName: raw.secondaryCategoryName ?? null,
        suggestedTeachingType: raw.suggestedTeachingType ?? null,
        plannedTeacherJobNo,
        lessonPlanUrl: raw.lessonPlanUrl ?? null,
      });
    }

    return { rows: valid, errors };
  }
}
