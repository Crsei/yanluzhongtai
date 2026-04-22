// apps/web/src/features/students/hooks/useStudentMutations.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { message } from "antd";
import {
  studentsApi,
  type CreateStudentBody,
  type UpdateStudentBody,
} from "../../../services/students";
import { HttpError } from "../../../services/http";

export function useStudentMutations() {
  const qc = useQueryClient();
  const invalidateList = () =>
    qc.invalidateQueries({ queryKey: ["students"] });

  const createMutation = useMutation({
    mutationFn: (body: CreateStudentBody) => studentsApi.create(body),
    onSuccess: () => {
      message.success("学生已添加");
      invalidateList();
    },
    onError: (err: unknown) => {
      message.error(err instanceof HttpError ? err.message : "添加失败，请稍后重试");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateStudentBody }) =>
      studentsApi.update(id, body),
    onSuccess: () => {
      message.success("学生信息已更新");
      invalidateList();
    },
    onError: (err: unknown) => {
      message.error(err instanceof HttpError ? err.message : "更新失败，请稍后重试");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => studentsApi.remove(id),
    onSuccess: () => {
      message.success("学生已删除");
      invalidateList();
    },
    onError: (err: unknown) => {
      if (err instanceof HttpError && err.status === 409) {
        message.error(err.message);
      } else {
        message.error("删除失败，请稍后重试");
      }
    },
  });

  return { createMutation, updateMutation, removeMutation };
}
