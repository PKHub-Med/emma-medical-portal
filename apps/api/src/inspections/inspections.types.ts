export type InspectionDue = 'overdue' | 'next30days' | 'future' | 'all';

export interface InspectionsQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  departmentId?: string;
  status?: string;
  result?: string;
  due?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface InspectionListItem {
  id: string;
  businessNumber: string;
  customerStatusCode: string;
  customerLabel: string;
  result: string | null;
  isTerminal: boolean;
  plannedAt: Date | null;
  performedAt: Date | null;
  dueAt: Date | null;
  updatedAt: Date;
  isOverdue: boolean;
  device: {
    id: string;
    name: string;
    serialNo: string | null;
    inventoryNo: string | null;
  };
  department: { id: string; name: string } | null;
}

export interface InspectionsPage {
  items: InspectionListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
}
