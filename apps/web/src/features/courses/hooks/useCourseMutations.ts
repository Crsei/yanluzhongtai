import { useMutation, useQueryClient } from "@tanstack/react-query";
import { message } from "antd";
import { coursesApi } from "../../../services/courses";
import type { CreateCourseBody, UpdateCourseBody } from "../types";

export function useCourseMutations() {
  const qc = useQueryClient();
  const invalidateList = () => qc.invalidateQueries({ queryKey: ["courses"] });

  const create = useMutation({
    mutationFn: (body: CreateCourseBody) => coursesApi.create(body),
    onSuccess: () => {
      invalidateList();
      message.success("课程已添加");
    },
    onError: (err: Error) => message.error(err.message || "添加失败"),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCourseBody }) =>
      coursesApi.update(id, body),
    onSuccess: (detail) => {
      qc.invalidateQueries({ queryKey: ["course", detail.id] });
      invalidateList();
      message.success("已更新");
    },
    onError: (err: Error) => message.error(err.message || "保存失败"),
  });

  const removeMany = useMutation({
    mutationFn: (ids: string[]) => coursesApi.removeMany(ids),
    onSuccess: () => {
      invalidateList();
      message.success("已删除");
    },
    onError: (err: Error) => message.error(err.message || "删除失败"),
  });

  const importDryRun = useMutation({
    mutationFn: (fileKey: string) => coursesApi.importDryRun(fileKey),
  });

  const importCommit = useMutation({
    mutationFn: (fileKey: string) => coursesApi.importCommit(fileKey),
    onSuccess: () => invalidateList(),
  });

  return { create, update, removeMany, importDryRun, importCommit };
}
