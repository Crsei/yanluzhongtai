import { useMutation, useQueryClient } from "@tanstack/react-query";
import { message } from "antd";
import { employeesApi } from "../../../services/employees";
import { HttpError } from "../../../services/http";
import type { CreateEmployeeBody, UpdateEmployeeBody } from "../types";

export function useEmployeeMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["employees"] });

  const createMutation = useMutation({
    mutationFn: (body: CreateEmployeeBody) => employeesApi.create(body),
    onSuccess: () => {
      message.success("员工已添加");
      invalidate();
    },
    onError: (err: unknown) => {
      message.error(err instanceof HttpError ? err.message : "添加失败，请稍后重试");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateEmployeeBody }) =>
      employeesApi.update(id, body),
    onSuccess: () => {
      message.success("员工信息已更新");
      invalidate();
    },
    onError: (err: unknown) => {
      message.error(err instanceof HttpError ? err.message : "更新失败，请稍后重试");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => employeesApi.remove(id),
    onSuccess: () => {
      message.success("员工已删除");
      invalidate();
    },
    onError: (err: unknown) => {
      if (err instanceof HttpError && err.status === 409) {
        message.error(err.message);
      } else {
        message.error("删除失败，请稍后重试");
      }
    },
  });
  const removeManyMutation = useMutation({
    mutationFn: (ids: string[]) => employeesApi.removeMany(ids),
    onSuccess: () => {
      invalidate();
      message.success("员工已删除");
    },
    onError: (err: Error) => message.error(err.message || "删除失败"),
  });

  return { createMutation, updateMutation, removeMutation, removeManyMutation };
}
