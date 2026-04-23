import { useMutation, useQueryClient } from "@tanstack/react-query";
import { message } from "antd";
import { payrollApi } from "../../../services/payroll";
import type {
  CreateManualRecordBody,
  SettlePayrollBody,
} from "../types";

export function usePayrollMutations() {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["payroll"] });

  const settle = useMutation({
    mutationFn: (body: SettlePayrollBody) => payrollApi.settle(body),
    onSuccess: () => {
      invalidate();
      message.success("结算已记录");
    },
    onError: (err: Error) => message.error(err.message || "结算失败"),
  });

  const addManual = useMutation({
    mutationFn: (body: CreateManualRecordBody) => payrollApi.addManual(body),
    onSuccess: () => {
      invalidate();
      message.success("已添加手动记录");
    },
    onError: (err: Error) => message.error(err.message || "添加失败"),
  });

  const deleteManual = useMutation({
    mutationFn: (id: string) => payrollApi.deleteManual(id),
    onSuccess: () => {
      invalidate();
      message.success("手动记录已删除");
    },
    onError: (err: Error) => message.error(err.message || "删除失败"),
  });

  return { settle, addManual, deleteManual };
}
