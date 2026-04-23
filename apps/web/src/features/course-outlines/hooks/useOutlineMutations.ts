import { useMutation, useQueryClient } from "@tanstack/react-query";
import { message } from "antd";
import { courseOutlinesApi } from "../../../services/course-outlines";
import { HttpError } from "../../../services/http";
import type {
  CreateItemBody,
  UpdateItemBody,
} from "../types";

export function useOutlineMutations(activeVersionId: string | null) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["outline-versions"] });
    if (activeVersionId) {
      qc.invalidateQueries({ queryKey: ["outline", activeVersionId] });
    }
  };

  const notifyError = (err: unknown, fallback: string) => {
    message.error(err instanceof HttpError ? err.message : fallback);
  };

  const createVersion = useMutation({
    mutationFn: () => courseOutlinesApi.createVersion(),
    onSuccess: (created) => {
      message.success(`已创建 ${created.versionName}`);
      invalidate();
    },
    onError: (err) => notifyError(err, "创建大纲失败"),
  });

  const deleteVersion = useMutation({
    mutationFn: ({ id, confirmVersionName }: { id: string; confirmVersionName: string }) =>
      courseOutlinesApi.deleteVersion(id, confirmVersionName),
    onSuccess: () => {
      message.success("版本已删除");
      invalidate();
    },
    onError: (err) => notifyError(err, "删除大纲失败"),
  });

  const addItem = useMutation({
    mutationFn: ({ versionId, body }: { versionId: string; body: CreateItemBody }) =>
      courseOutlinesApi.addItem(versionId, body),
    onSuccess: () => {
      message.success("已添加条目");
      invalidate();
    },
    onError: (err) => notifyError(err, "添加失败"),
  });

  const updateItem = useMutation({
    mutationFn: ({ itemId, body }: { itemId: string; body: UpdateItemBody }) =>
      courseOutlinesApi.updateItem(itemId, body),
    onSuccess: () => {
      message.success("条目已更新");
      invalidate();
    },
    onError: (err) => notifyError(err, "更新失败"),
  });

  const deleteItems = useMutation({
    mutationFn: (ids: string[]) => courseOutlinesApi.deleteItems(ids),
    onSuccess: (res) => {
      message.success(`已删除 ${res.deleted} 条`);
      invalidate();
    },
    onError: (err) => notifyError(err, "删除失败"),
  });

  const importCommit = useMutation({
    mutationFn: ({ versionId, fileKey }: { versionId: string; fileKey: string }) =>
      courseOutlinesApi.importCommit(versionId, fileKey),
    onSuccess: (res) => {
      message.success(
        `已导入 ${res.createdSections} 个板块 / ${res.createdItems} 条条目`,
      );
      invalidate();
    },
    onError: (err) => notifyError(err, "导入失败"),
  });

  return { createVersion, deleteVersion, addItem, updateItem, deleteItems, importCommit };
}
