export type VersionListItem = {
  id: string;
  versionName: string;
  isActive: boolean;
  itemCount: number;
  createdAt: string;
};

export type PlannedTeacherSummary = {
  jobNo: string;
  name: string | null;
  employmentStatus: "FULL_TIME" | "PART_TIME" | "RESIGNED" | null;
};

export type ActualTeacherSummary = {
  jobNo: string;
  name: string | null;
  employmentStatus: "FULL_TIME" | "PART_TIME" | "RESIGNED" | null;
  courseCount: number;
};

export type CourseSection = {
  id: string;
  outlineVersionId: string;
  code: string;
  name: string;
  displayOrder: number;
};

export type CourseOutlineItem = {
  id: string;
  outlineVersionId: string;
  sectionCode: string;
  sequenceNo: string | null;
  secondaryCategoryName: string | null;
  suggestedTeachingType: string | null;
  plannedTeacherJobNo: string | null;
  lessonPlanUrl: string | null;
  plannedTeacher: PlannedTeacherSummary | null;
  actualTeachers: ActualTeacherSummary[];
};

export type VersionDetail = {
  version: {
    id: string;
    versionName: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  };
  sections: CourseSection[];
  items: CourseOutlineItem[];
};

export type CreateItemBody = {
  sectionCode?: string;
  newSection?: { code: string; name: string; displayOrder?: number };
  sequenceNo?: string | null;
  secondaryCategoryName?: string | null;
  suggestedTeachingType?: string | null;
  plannedTeacherJobNo?: string | null;
  lessonPlanUrl?: string | null;
};

export type UpdateItemBody = Partial<{
  sectionCode: string;
  sequenceNo: string | null;
  secondaryCategoryName: string | null;
  suggestedTeachingType: string | null;
  plannedTeacherJobNo: string | null;
  lessonPlanUrl: string | null;
}>;

export type ImportRowError = {
  row: number;
  field: string;
  message: string;
};

export type OutlineImportReport = {
  totalRows: number;
  validRows: number;
  uniqueSections: number;
  errors: ImportRowError[];
};

export type OutlineImportCommitResult = {
  createdSections: number;
  createdItems: number;
  errors: ImportRowError[];
};
