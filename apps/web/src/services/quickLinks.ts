import { api } from "./http";
import type {
  CreateQuickLinkBody,
  QuickLinkListResponse,
  QuickLinkPageType,
  QuickLinkRow,
  ReorderQuickLinksBody,
  UpdateQuickLinkBody,
} from "../features/quick-links/types";

export const quickLinksApi = {
  listPublicSop: () =>
    api.get<QuickLinkListResponse>("/public/sop-links", { auth: false }),
  listByPageType: (pageType: QuickLinkPageType) =>
    api.get<QuickLinkListResponse>(
      `/quick-links?pageType=${encodeURIComponent(pageType)}`,
    ),
  create: (body: CreateQuickLinkBody) =>
    api.post<QuickLinkRow>("/quick-links", body),
  update: (id: string, body: UpdateQuickLinkBody) =>
    api.patch<QuickLinkRow>(`/quick-links/${id}`, body),
  remove: (id: string) => api.delete<void>(`/quick-links/${id}`),
  reorder: (body: ReorderQuickLinksBody) =>
    api.post<void>("/quick-links/reorder", body),
};
