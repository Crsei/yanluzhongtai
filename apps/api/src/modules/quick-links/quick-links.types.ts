import type { QuickLinkKind, QuickLinkPageType } from "@prisma/client";

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
