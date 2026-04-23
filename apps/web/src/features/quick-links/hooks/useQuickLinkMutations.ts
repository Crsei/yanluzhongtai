import { useMutation, useQueryClient } from "@tanstack/react-query";
import { message } from "antd";
import { quickLinksApi } from "../../../services/quickLinks";
import type {
  CreateQuickLinkBody,
  ReorderQuickLinksBody,
  UpdateQuickLinkBody,
} from "../types";

export function useQuickLinkMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["quick-links"] });

  const create = useMutation({
    mutationFn: (body: CreateQuickLinkBody) => quickLinksApi.create(body),
    onSuccess: () => {
      invalidate();
      message.success("已添加");
    },
    onError: (err: Error) => message.error(err.message || "添加失败"),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateQuickLinkBody }) =>
      quickLinksApi.update(id, body),
    onSuccess: () => {
      invalidate();
      message.success("已保存");
    },
    onError: (err: Error) => message.error(err.message || "保存失败"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => quickLinksApi.remove(id),
    onSuccess: () => {
      invalidate();
      message.success("已删除");
    },
    onError: (err: Error) => message.error(err.message || "删除失败"),
  });

  const reorder = useMutation({
    mutationFn: (body: ReorderQuickLinksBody) => quickLinksApi.reorder(body),
    onSuccess: () => {
      invalidate();
      message.success("排序已保存");
    },
    onError: (err: Error) => message.error(err.message || "排序失败"),
  });

  return { create, update, remove, reorder };
}
