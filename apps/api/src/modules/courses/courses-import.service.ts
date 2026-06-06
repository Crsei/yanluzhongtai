import { Injectable } from "@nestjs/common";

import { Prisma } from "@prisma/client";

import * as ExcelJS from "exceljs";

import {

  COURSE_SECTION_CODE_BY_LABEL,

  COURSE_SECTION_LABELS,

  TEACHING_TYPE,

  type TeachingType,

} from "../../common/dictionaries";

import {

  composeCourseSeqKind,

  deriveYy,

  formatCourseNo,

  formatNnn,

  normalizeKk,

  normalizeTt,

} from "../../common/course-no/course-no";

import { computeCreditHours } from "../../common/course-no/course-status";

import { IdSequenceService } from "../../common/id-sequence/id-sequence.service";

import { AuditLogsService } from "../audit-logs/audit-logs.service";

import { PrismaService } from "../../prisma/prisma.service";

import { StorageService } from "../storage/storage.service";

import { buildExportWorkbook, decimalToNumber, type ExportColumn } from "../../common/export/export-utils";

import type {

  CourseImportCommitResult,

  CourseImportReport,

  CourseImportRowError,

} from "./courses.types";

const COLUMNS = [
  "name",
  "studentNos",
  "outlineVersionName",
  "sectionName",
  "secondaryCategoryName",
  "sectionCode",
  "categorySequenceNo",
  "plannedAt",
  "actualTeacherJobNo",
  "actualTeachingType",
  "durationMinutes",
  "replayUrl",
  "videoUrl",
  "resourceUrl",
  "note",
] as const;

type Col = (typeof COLUMNS)[number];

const COLUMN_HEADERS: Record<Col, string> = {
  name: "课程名称",
  studentNos: "上课学生",
  outlineVersionName: "来自课程大纲",
  sectionName: "课程所属板块",
  secondaryCategoryName: "二级课程类别",
  sectionCode: "板块代码",
  categorySequenceNo: "类别序号",
  plannedAt: "计划授课时间",
  actualTeacherJobNo: "实际授课老师",
  actualTeachingType: "实际授课方式",
  durationMinutes: "授课时长",
  replayUrl: "直播回放链接",
  videoUrl: "录播视频链接",
  resourceUrl: "外部资源链接",
  note: "备注",
};

const COLUMN_HEADER_ALIASES: Record<Col, readonly string[]> = {
  name: ["课程名称"],
  studentNos: ["上课学生", "选课学号(分号分隔)", "选课学号"],
  outlineVersionName: ["来自课程大纲"],
  sectionName: ["课程所属板块", "板块名称"],
  secondaryCategoryName: ["二级课程类别", "二级课程类别名称"],
  sectionCode: ["板块代码"],
  categorySequenceNo: ["类别序号"],
  plannedAt: ["计划授课时间", "计划授课时间(YYYY-MM-DD HH:mm)"],
  actualTeacherJobNo: ["实际授课老师", "实际授课老师工号"],
  actualTeachingType: ["实际授课方式"],
  durationMinutes: ["授课时长", "授课时长(分钟)"],
  replayUrl: ["直播回放链接"],
  videoUrl: ["录播视频链接"],
  resourceUrl: ["外部资源链接"],
  note: ["备注"],
};

const REQUIRED_COLUMNS: Col[] = [];

const COURSE_SECTION_IMPORT_ALIASES: Record<string, string> = {
  论文辅导: "LW",
  作品集: "ZP",
};

type ValidatedRow = {
  rowNumber: number;
  courseNoSectionCode: string;
  courseNoCategorySequenceNo: string;
  sectionCode: string | null;
  categorySequenceNo: string | null;
  name: string | null;
  plannedAt: Date | null;
  actualTeacherJobNo: string | null;
  actualTeachingType: TeachingType | null;
  durationMinutes: number | null;
  studentIds: string[];
  replayUrl: string | null;
  videoUrl: string | null;
  resourceUrl: string | null;
  note: string | null;
  outlineItemId: string | null;
  outlineVersionId: string | null;
  sectionName: string | null;
  secondaryCategoryName: string | null;
  suggestedTeachingType: string | null;
};

@Injectable()
export class CoursesImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly idSequence: IdSequenceService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async generateTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("课程导入");
    sheet.columns = COLUMNS.map((k) => ({ header: COLUMN_HEADERS[k], key: k, width: 22 }));
    sheet.addRow({
      name: "微积分一对一-26级-春季-01",
      studentNos: "260001;260002",
      outlineVersionName: "26A",
      sectionName: "GPA提升",
      secondaryCategoryName: "微积分一对一",
      plannedAt: "2026-05-10 18:00",
      actualTeacherJobNo: "26001",
      actualTeachingType: "1v1",
      durationMinutes: 90,
      replayUrl: "",
      videoUrl: "",
      resourceUrl: "",
      note: "",
    });
    sheet.getRow(1).font = { bold: true };

    sheet.views = [{ state: "frozen", ySplit: 1 }];

    const buf = await workbook.xlsx.writeBuffer();

    return Buffer.from(buf);

  }



  // -------------------------------------------------------------- export ----



  private static readonly EXPORT_COLUMNS: ExportColumn[] = [

    { header: "课程编号", key: "courseNo" },

    { header: "课程名称", key: "name" },

    { header: "板块代码", key: "sectionCode" },

    { header: "板块名称", key: "sectionName" },

    { header: "二级课程类别", key: "secondaryCategoryName" },

    { header: "序列号", key: "categorySequenceNo" },

    { header: "建议授课方式", key: "suggestedTeachingType" },

    { header: "计划授课时间", key: "plannedAt" },

    { header: "实际授课老师工号", key: "actualTeacherJobNo" },

    { header: "实际授课方式", key: "actualTeachingType" },

    { header: "时长(分钟)", key: "durationMinutes" },

    { header: "课时数", key: "creditHours" },

    { header: "回放链接", key: "replayUrl" },

    { header: "视频链接", key: "videoUrl" },

    { header: "资源链接", key: "resourceUrl" },

    { header: "备注", key: "note" },

  ];



  /** Export all Course records as an Excel workbook buffer. */

  async exportAll(): Promise<Buffer> {

    const courses = await this.prisma.course.findMany({

      orderBy: { courseNo: "asc" },

    });



    const rows = courses.map((course) => ({

      courseNo: course.courseNo,

      name: course.name ?? "",

      sectionCode: course.sectionCode ?? "",

      sectionName: course.sectionName ?? "",

      secondaryCategoryName: course.secondaryCategoryName ?? "",

      categorySequenceNo: course.categorySequenceNo ?? "",

      suggestedTeachingType: course.suggestedTeachingType ?? "",

      plannedAt: course.plannedAt

        ? course.plannedAt.toISOString().replace("T", " ").slice(0, 16)

        : "",

      actualTeacherJobNo: course.actualTeacherJobNo ?? "",

      actualTeachingType: course.actualTeachingType ?? "",

      durationMinutes: course.durationMinutes ?? "",

      creditHours: decimalToNumber(course.creditHours) ?? "",

      replayUrl: course.replayUrl ?? "",

      videoUrl: course.videoUrl ?? "",

      resourceUrl: course.resourceUrl ?? "",

      note: course.note ?? "",

    }));



    return buildExportWorkbook(CoursesImportService.EXPORT_COLUMNS, rows);

  }



  async dryRun(fileKey: string): Promise<CourseImportReport> {
    const buffer = await this.storage.readObject(fileKey);
    const { rows, errors } = await this.parse(buffer);
    if (errors.length > 0) {
      return { totalRows: rows.length, validRows: 0, errors };
    }
    const validated = await this.validate(rows);
    return {
      totalRows: rows.length,
      validRows: validated.rows.length,
      errors: validated.errors,
    };
  }

  async commit(fileKey: string, operatorId: string): Promise<CourseImportCommitResult> {
    const buffer = await this.storage.readObject(fileKey);
    const { rows, errors } = await this.parse(buffer);
    if (errors.length > 0) return { created: 0, errors };
    const validated = await this.validate(rows);
    if (validated.errors.length > 0) return { created: 0, errors: validated.errors };

    let created = 0;
    for (const row of validated.rows) {
      const { yy, year } = deriveYy(row.plannedAt);
      const tt = normalizeTt(row.courseNoSectionCode);
      const kk = normalizeKk(row.courseNoCategorySequenceNo);
      const seq = await this.idSequence.allocate(composeCourseSeqKind(tt, kk), year);
      const courseNo = formatCourseNo({ tt, kk, yy, nnn: formatNnn(seq) });
      const creditHours = computeCreditHours(row.durationMinutes);

      const createdRow = await this.prisma.$transaction(async (tx) => {
        const course = await tx.course.create({
          data: {
            courseNo,
            name: row.name,
            outlineVersionId: row.outlineVersionId,
            outlineItemId: row.outlineItemId,
            sectionCode: row.sectionCode,
            sectionName: row.sectionName,
            categorySequenceNo: row.categorySequenceNo,
            secondaryCategoryName: row.secondaryCategoryName,
            suggestedTeachingType: row.suggestedTeachingType,
            plannedAt: row.plannedAt,
            courseYear: year,
            actualTeacherJobNo: row.actualTeacherJobNo,
            actualTeachingType: row.actualTeachingType,
            durationMinutes: row.durationMinutes,
            creditHours: creditHours === null ? null : new Prisma.Decimal(creditHours),
            replayUrl: row.replayUrl,
            videoUrl: row.videoUrl,
            resourceUrl: row.resourceUrl,
            note: row.note,
          },
        });
        if (row.studentIds.length > 0) {
          await tx.enrollment.createMany({
            data: row.studentIds.map((studentId) => ({ studentId, courseId: course.id })),
          });
        }
        return course;
      });

      await this.auditLogs.record({
        operatorId,
        action: "course.create",
        targetType: "course",
        targetId: createdRow.id,
        after: {
          ...createdRow,
          studentIds: row.studentIds,
          source: "import",
        } as unknown as Record<string, unknown>,
      });
      created += 1;
    }

    return { created, errors: [] };
  }

  // ---------------------------------------------------------------- parse ----

  private cellToString(value: ExcelJS.CellValue): string {
    if (value == null) return "";
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object" && "text" in value) return String(value.text ?? "").trim();
    if (typeof value === "object" && "result" in value) return String(value.result ?? "").trim();
    return String(value).trim();
  }

  private blankToUndefined(value?: string): string | undefined {
    if (!value || value === "——") return undefined;
    return value;
  }

  private async parse(
    buffer: Buffer,
  ): Promise<{
    rows: Array<{ rowNumber: number; raw: Partial<Record<Col, string>> }>;
    errors: CourseImportRowError[];
  }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return { rows: [], errors: [{ row: 0, field: "header", message: "未找到任何工作表" }] };
    }

    const headerRow = sheet.getRow(1);
    const headerMap = new Map<number, Col>();
    headerRow.eachCell((cell, colNumber) => {
      const text = this.cellToString(cell.value);
      const matched = COLUMNS.find((k) => COLUMN_HEADER_ALIASES[k].includes(text));
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

    const rows: Array<{ rowNumber: number; raw: Partial<Record<Col, string>> }> = [];
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const raw: Partial<Record<Col, string>> = {};
      let hasAny = false;
      headerMap.forEach((key, colNumber) => {
        const value = this.blankToUndefined(this.cellToString(row.getCell(colNumber).value));
        if (value !== undefined) {
          raw[key] = value;
          hasAny = true;
        }
      });
      if (hasAny) rows.push({ rowNumber: r, raw });
    }
    return { rows, errors: [] };
  }

  // ------------------------------------------------------------- validate ----

  private async validate(
    rows: Array<{ rowNumber: number; raw: Partial<Record<Col, string>> }>,
  ): Promise<{ rows: ValidatedRow[]; errors: CourseImportRowError[] }> {
    const errors: CourseImportRowError[] = [];
    const valid: ValidatedRow[] = [];

    const activeOutline = await this.prisma.courseOutlineVersion.findFirst({
      where: { isActive: true },
      include: { sections: true, items: true },
    });
    const sectionByCode = new Map((activeOutline?.sections ?? []).map((s) => [s.code, s]));
    const itemByKey = new Map(
      (activeOutline?.items ?? [])
        .filter((i) => i.sequenceNo)
        .map((i) => [`${i.sectionCode}|${i.sequenceNo}`, i]),
    );
    const itemBySectionAndName = new Map(
      (activeOutline?.items ?? [])
        .filter((i) => i.secondaryCategoryName)
        .map((i) => [`${i.sectionCode}|${i.secondaryCategoryName}`, i]),
    );

    // Preload teachers & students for bulk check
    const teacherInputs = new Set<string>();
    const studentInputs = new Set<string>();
    for (const { raw } of rows) {
      if (raw.actualTeacherJobNo) teacherInputs.add(raw.actualTeacherJobNo);
      if (raw.studentNos) {
        for (const no of raw.studentNos.split(/[;,，；、\n]/).map((s) => s.trim()).filter(Boolean)) {
          studentInputs.add(no);
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
    const students = studentInputs.size
      ? await this.prisma.student.findMany({
          where: {
            OR: [
              { studentNo: { in: [...studentInputs] } },
              { name: { in: [...studentInputs] } },
            ],
          },
          select: { id: true, studentNo: true, name: true },
        })
      : [];
    const studentByNo = new Map(students.map((s) => [s.studentNo, s]));
    const studentByName = new Map(students.map((s) => [s.name, s]));

    for (const { rowNumber, raw } of rows) {
      const rowErrors: CourseImportRowError[] = [];

      for (const key of REQUIRED_COLUMNS) {
        if (!raw[key]) rowErrors.push({ row: rowNumber, field: COLUMN_HEADERS[key], message: "必填" });
      }

      const tt = raw.sectionCode
        ? raw.sectionCode.toUpperCase()
        : raw.sectionName
          ? (COURSE_SECTION_CODE_BY_LABEL[raw.sectionName] ?? COURSE_SECTION_IMPORT_ALIASES[raw.sectionName] ?? "")
          : "";
      if (tt && !/^[A-Z]{1,2}$/.test(tt)) {
        rowErrors.push({ row: rowNumber, field: COLUMN_HEADERS.sectionCode, message: "需为 1-2 位字母" });
      }
      const section = tt ? sectionByCode.get(tt) : undefined;
      if (tt && !section) {
        rowErrors.push({
          row: rowNumber,
          field: raw.sectionName ? COLUMN_HEADERS.sectionName : COLUMN_HEADERS.sectionCode,
          message: `大纲中无板块 ${raw.sectionName ?? tt}`,
        });
      }
      if (
        raw.sectionName &&
        tt &&
        section &&
        section.name !== raw.sectionName &&
        COURSE_SECTION_IMPORT_ALIASES[raw.sectionName] !== tt
      ) {
        rowErrors.push({
          row: rowNumber,
          field: COLUMN_HEADERS.sectionName,
          message: `板块 ${tt} 的名称应为 "${section.name}"`,
        });
      }
      if (false) {
        rowErrors.push({
          row: rowNumber,
          field: COLUMN_HEADERS.sectionName,
          message: `板块 ${tt} 的名称应为 "${COURSE_SECTION_LABELS[tt as keyof typeof COURSE_SECTION_LABELS]}"`,
        });
      }

      let kk = "";
      if (raw.categorySequenceNo) {
        try {
          kk = normalizeKk(raw.categorySequenceNo);
        } catch (e) {
          rowErrors.push({ row: rowNumber, field: COLUMN_HEADERS.categorySequenceNo, message: (e as Error).message });
        }
      }

      const item = tt && kk
        ? itemByKey.get(`${tt}|${kk}`)
        : tt && raw.secondaryCategoryName
          ? itemBySectionAndName.get(`${tt}|${raw.secondaryCategoryName}`)
          : undefined;
      if (item?.sequenceNo && !kk) kk = item.sequenceNo;
      if (tt && (kk || raw.secondaryCategoryName) && !item) {
        rowErrors.push({
          row: rowNumber,
          field: raw.secondaryCategoryName ? COLUMN_HEADERS.secondaryCategoryName : COLUMN_HEADERS.categorySequenceNo,
          message: `大纲中无 ${raw.secondaryCategoryName ?? `${tt}${kk}`} 条目`,
        });
      }

      let plannedAt: Date | null = null;
      if (raw.plannedAt) {
        const d = new Date(raw.plannedAt.replace(" ", "T"));
        if (Number.isNaN(d.getTime())) {
          rowErrors.push({ row: rowNumber, field: COLUMN_HEADERS.plannedAt, message: "日期格式无效，需为 YYYY-MM-DD HH:mm" });
        } else plannedAt = d;
      }

      let actualTeachingType: TeachingType | null = null;
      if (raw.actualTeachingType) {
        if (!(TEACHING_TYPE as readonly string[]).includes(raw.actualTeachingType)) {
          rowErrors.push({
            row: rowNumber,
            field: "实际授课方式",
            message: `非法值,仅支持 ${TEACHING_TYPE.join("/")}`,
          });
        } else actualTeachingType = raw.actualTeachingType as TeachingType;
      }

      let actualTeacherJobNo: string | null = null;
      if (raw.actualTeacherJobNo) {
        const t = teacherByJobNo.get(raw.actualTeacherJobNo) ?? teacherByName.get(raw.actualTeacherJobNo);
        if (!t) {
          rowErrors.push({
            row: rowNumber,
            field: COLUMN_HEADERS.actualTeacherJobNo,
            message: `员工 ${raw.actualTeacherJobNo} 不存在`,
          });
        } else if (t.employmentStatus === "RESIGNED") {
          rowErrors.push({
            row: rowNumber,
            field: COLUMN_HEADERS.actualTeacherJobNo,
            message: `员工 ${raw.actualTeacherJobNo} 已离职`,
          });
        } else actualTeacherJobNo = t.jobNo;
      }

      let durationMinutes: number | null = null;
      if (raw.durationMinutes) {
        const n = Number(raw.durationMinutes);
        if (!Number.isFinite(n) || n < 0) {
          rowErrors.push({ row: rowNumber, field: COLUMN_HEADERS.durationMinutes, message: "需为非负数" });
        } else durationMinutes = Math.round(n);
      }

      const studentIds: string[] = [];
      if (raw.studentNos) {
        const nos = raw.studentNos.split(/[;,，；、\n]/).map((s) => s.trim()).filter(Boolean);
        for (const no of nos) {
          const s = studentByNo.get(no) ?? studentByName.get(no);
          if (!s) {
            rowErrors.push({ row: rowNumber, field: COLUMN_HEADERS.studentNos, message: `学生 ${no} 不存在` });
          } else studentIds.push(s.id);
        }
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        continue;
      }

      valid.push({
        rowNumber,
        courseNoSectionCode: tt || "XX",
        courseNoCategorySequenceNo: kk || "99",
        sectionCode: tt || null,
        categorySequenceNo: kk || null,
        name: raw.name ?? item?.secondaryCategoryName ?? null,
        plannedAt,
        actualTeacherJobNo,
        actualTeachingType,
        durationMinutes,
        studentIds,
        replayUrl: raw.replayUrl ?? null,
        videoUrl: raw.videoUrl ?? null,
        resourceUrl: raw.resourceUrl ?? null,
        note: raw.note ?? null,
        outlineItemId: item?.id ?? null,
        outlineVersionId: item?.outlineVersionId ?? null,
        sectionName: section?.name ?? raw.sectionName ?? null,
        secondaryCategoryName: item?.secondaryCategoryName ?? raw.secondaryCategoryName ?? null,
        suggestedTeachingType: item?.suggestedTeachingType ?? null,
      });
    }

    return { rows: valid, errors };
  }
}
