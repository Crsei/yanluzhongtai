import { Injectable, BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as ExcelJS from "exceljs";
import {
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
import type {
  CourseImportCommitResult,
  CourseImportReport,
  CourseImportRowError,
} from "./courses.types";

const COLUMNS = [
  "sectionCode",
  "categorySequenceNo",
  "name",
  "plannedAt",
  "actualTeacherJobNo",
  "actualTeachingType",
  "durationMinutes",
  "studentNos",
  "note",
] as const;

type Col = (typeof COLUMNS)[number];

const COLUMN_HEADERS: Record<Col, string> = {
  sectionCode: "板块代码",
  categorySequenceNo: "类别序号",
  name: "课程名称",
  plannedAt: "计划授课时间(YYYY-MM-DD HH:mm)",
  actualTeacherJobNo: "实际授课老师工号",
  actualTeachingType: "实际授课方式",
  durationMinutes: "授课时长(分钟)",
  studentNos: "选课学号(分号分隔)",
  note: "备注",
};

const REQUIRED_COLUMNS: Col[] = ["sectionCode", "categorySequenceNo", "name"];

type ValidatedRow = {
  rowNumber: number;
  sectionCode: string;
  categorySequenceNo: string;
  name: string;
  plannedAt: Date | null;
  actualTeacherJobNo: string | null;
  actualTeachingType: TeachingType | null;
  durationMinutes: number | null;
  studentIds: string[];
  note: string | null;
  outlineItemId: string;
  outlineVersionId: string;
  sectionName: string;
  secondaryCategoryName: string;
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
      sectionCode: "GP",
      categorySequenceNo: "01",
      name: "微积分一对一-26级-春季-01",
      plannedAt: "2026-05-10 18:00",
      actualTeacherJobNo: "26001",
      actualTeachingType: "1v1",
      durationMinutes: 90,
      studentNos: "260001;260002",
      note: "",
    });
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
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
      const tt = normalizeTt(row.sectionCode);
      const kk = normalizeKk(row.categorySequenceNo);
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
            sectionCode: tt,
            sectionName: row.sectionName,
            categorySequenceNo: kk,
            secondaryCategoryName: row.secondaryCategoryName,
            suggestedTeachingType: row.suggestedTeachingType,
            plannedAt: row.plannedAt,
            courseYear: year,
            actualTeacherJobNo: row.actualTeacherJobNo,
            actualTeachingType: row.actualTeachingType,
            durationMinutes: row.durationMinutes,
            creditHours: creditHours === null ? null : new Prisma.Decimal(creditHours),
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
      const text = String(cell.value ?? "").trim();
      const matched = COLUMNS.find((k) => COLUMN_HEADERS[k] === text);
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
    if (!activeOutline) {
      throw new BadRequestException("当前无激活的大纲版本,无法导入课程");
    }
    const sectionByCode = new Map(activeOutline.sections.map((s) => [s.code, s]));
    const itemByKey = new Map(
      activeOutline.items.map((i) => [`${i.sectionCode}|${i.sequenceNo}`, i]),
    );

    // Preload teachers & students for bulk check
    const teacherJobNos = new Set<string>();
    const studentNos = new Set<string>();
    for (const { raw } of rows) {
      if (raw.actualTeacherJobNo) teacherJobNos.add(raw.actualTeacherJobNo);
      if (raw.studentNos) {
        for (const no of raw.studentNos.split(/[;,、]/).map((s) => s.trim()).filter(Boolean)) {
          studentNos.add(no);
        }
      }
    }
    const teachers = teacherJobNos.size
      ? await this.prisma.employee.findMany({
          where: { jobNo: { in: [...teacherJobNos] } },
          select: { jobNo: true, employmentStatus: true },
        })
      : [];
    const teacherMap = new Map(teachers.map((t) => [t.jobNo, t]));
    const students = studentNos.size
      ? await this.prisma.student.findMany({
          where: { studentNo: { in: [...studentNos] } },
          select: { id: true, studentNo: true },
        })
      : [];
    const studentByNo = new Map(students.map((s) => [s.studentNo, s]));

    for (const { rowNumber, raw } of rows) {
      const rowErrors: CourseImportRowError[] = [];

      for (const key of REQUIRED_COLUMNS) {
        if (!raw[key]) rowErrors.push({ row: rowNumber, field: COLUMN_HEADERS[key], message: "必填" });
      }

      const tt = raw.sectionCode ? raw.sectionCode.toUpperCase() : "";
      if (tt && !/^[A-Z]{1,2}$/.test(tt)) {
        rowErrors.push({ row: rowNumber, field: "板块代码", message: "需为 1-2 位字母" });
      }
      const section = tt ? sectionByCode.get(tt) : undefined;
      if (tt && !section) {
        rowErrors.push({ row: rowNumber, field: "板块代码", message: `大纲中无板块 ${tt}` });
      }

      let kk = "";
      if (raw.categorySequenceNo) {
        try {
          kk = normalizeKk(raw.categorySequenceNo);
        } catch (e) {
          rowErrors.push({ row: rowNumber, field: "类别序号", message: (e as Error).message });
        }
      }

      const item = tt && kk ? itemByKey.get(`${tt}|${kk}`) : undefined;
      if (tt && kk && !item) {
        rowErrors.push({
          row: rowNumber,
          field: "类别序号",
          message: `大纲中无 ${tt}${kk} 条目`,
        });
      }

      let plannedAt: Date | null = null;
      if (raw.plannedAt) {
        const d = new Date(raw.plannedAt.replace(" ", "T"));
        if (Number.isNaN(d.getTime())) {
          rowErrors.push({ row: rowNumber, field: "计划授课时间", message: "日期格式无效" });
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
        const t = teacherMap.get(raw.actualTeacherJobNo);
        if (!t) {
          rowErrors.push({
            row: rowNumber,
            field: "实际授课老师工号",
            message: `员工 ${raw.actualTeacherJobNo} 不存在`,
          });
        } else if (t.employmentStatus === "RESIGNED") {
          rowErrors.push({
            row: rowNumber,
            field: "实际授课老师工号",
            message: `员工 ${raw.actualTeacherJobNo} 已离职`,
          });
        } else actualTeacherJobNo = raw.actualTeacherJobNo;
      }

      let durationMinutes: number | null = null;
      if (raw.durationMinutes) {
        const n = Number(raw.durationMinutes);
        if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
          rowErrors.push({ row: rowNumber, field: "授课时长(分钟)", message: "需为非负整数" });
        } else durationMinutes = n;
      }

      const studentIds: string[] = [];
      if (raw.studentNos) {
        const nos = raw.studentNos.split(/[;,、]/).map((s) => s.trim()).filter(Boolean);
        for (const no of nos) {
          const s = studentByNo.get(no);
          if (!s) {
            rowErrors.push({ row: rowNumber, field: "选课学号", message: `学生 ${no} 不存在` });
          } else studentIds.push(s.id);
        }
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        continue;
      }

      valid.push({
        rowNumber,
        sectionCode: tt,
        categorySequenceNo: kk,
        name: raw.name!,
        plannedAt,
        actualTeacherJobNo,
        actualTeachingType,
        durationMinutes,
        studentIds,
        note: raw.note ?? null,
        outlineItemId: item!.id,
        outlineVersionId: item!.outlineVersionId,
        sectionName: section!.name,
        secondaryCategoryName: item!.secondaryCategoryName,
        suggestedTeachingType: item!.suggestedTeachingType,
      });
    }

    return { rows: valid, errors };
  }
}
