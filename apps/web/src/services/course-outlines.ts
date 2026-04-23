import { api, downloadAuthed } from "./http";
import type {
  CreateItemBody,
  CourseOutlineItem,
  OutlineImportCommitResult,
  OutlineImportReport,
  UpdateItemBody,
  VersionDetail,
  VersionListItem,
} from "../features/course-outlines/types";

export const courseOutlinesApi = {
  listVersions: () => api.get<VersionListItem[]>("/course-outlines/versions"),
  getVersion: (id: string) => api.get<VersionDetail>(`/course-outlines/versions/${id}`),
  createVersion: () => api.post<VersionListItem>("/course-outlines/versions", {}),
  deleteVersion: (id: string, confirmVersionName: string) =>
    api.delete<void>(`/course-outlines/versions/${id}`, {
      body: { confirmVersionName },
    }),
  addItem: (versionId: string, body: CreateItemBody) =>
    api.post<CourseOutlineItem>(`/course-outlines/versions/${versionId}/items`, body),
  updateItem: (itemId: string, body: UpdateItemBody) =>
    api.put<CourseOutlineItem>(`/course-outlines/items/${itemId}`, body),
  deleteItems: (ids: string[]) =>
    api.delete<{ deleted: number }>("/course-outlines/items", { body: { ids } }),
  importDryRun: (versionId: string, fileKey: string) =>
    api.post<OutlineImportReport>(
      `/course-outlines/versions/${versionId}/import/dry-run`,
      { fileKey },
    ),
  importCommit: (versionId: string, fileKey: string) =>
    api.post<OutlineImportCommitResult>(
      `/course-outlines/versions/${versionId}/import/commit`,
      { fileKey },
    ),
  downloadTemplate: () =>
    downloadAuthed("/course-outlines/template", "课程大纲空白模板.xlsx"),
};
