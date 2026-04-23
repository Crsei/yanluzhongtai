export type AuditLogItem = {
  id: string;
  createdAt: string;
  operatorId: string | null;
  operatorUsername: string | null;
  operatorPhone: string | null;
  action: string;
  targetType: string;
  targetId: string;
  fieldName: string | null;
  beforeValue: string | null;
  afterValue: string | null;
};

export type AuditLogListResponse = {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type AuditLogQueryParams = {
  page?: number;
  pageSize?: number;
  operatorId?: string;
  targetType?: string;
  action?: string;
  fromDate?: string;
  toDate?: string;
};
