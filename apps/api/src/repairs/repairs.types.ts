export interface RepairsQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  departmentId?: string;
  status?: string;
  state?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface RepairListItem {
  id: string;
  businessNumber: string;
  customerStatusCode: string;
  customerLabel: string;
  isTerminal: boolean;
  reportedAt: Date | null;
  updatedAt: Date;
  device: {
    id: string;
    name: string;
    serialNo: string | null;
    inventoryNo: string | null;
  };
  department: { id: string; name: string } | null;
}

export interface RepairsPage {
  items: RepairListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
}
