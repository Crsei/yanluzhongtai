export type QuickLinkPageType = "DATA_TABLE" | "SOP";
export type QuickLinkKind = "NAVIGATE" | "COPY" | "DOWNLOAD";

export type QuickLinkRow = {
  id: string;
  pageType: QuickLinkPageType;
  category: string;
  kind: QuickLinkKind;
  title: string;
  url: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type QuickLinkGroup = {
  category: string;
  items: QuickLinkRow[];
};

export type QuickLinkListResponse = {
  pageType: QuickLinkPageType;
  groups: QuickLinkGroup[];
};

export type CreateQuickLinkBody = {
  pageType: QuickLinkPageType;
  category: string;
  kind: QuickLinkKind;
  title: string;
  url: string;
};

export type UpdateQuickLinkBody = Partial<
  Omit<CreateQuickLinkBody, "pageType">
>;

export type ReorderQuickLinksBody = {
  pageType: QuickLinkPageType;
  items: Array<{ id: string; sortOrder: number }>;
};
