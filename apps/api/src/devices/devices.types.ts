export interface DevicesQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  departmentId?: string;
  manufacturer?: string;
  category?: string;
  active?: string;
}

export interface DeviceListItem {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  serialNo: string | null;
  inventoryNo: string | null;
  category: string | null;
  department: { id: string; name: string } | null;
  active: boolean;
}

export interface DevicesPage {
  items: DeviceListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface DeviceDetails extends DeviceListItem {
  qrEpc: string | null;
  passportNo: string | null;
  hospital: { id: string; name: string };
  repairs: [];
  inspections: [];
  documents: [];
}
