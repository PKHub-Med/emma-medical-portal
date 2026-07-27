export interface HospitalsQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  active?: string;
  portalEnabled?: string;
}

export interface HospitalItem {
  id: string;
  name: string;
  active: boolean;
  portalEnabled: boolean;
  departmentsCount: number;
  membershipsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface HospitalsPage {
  items: HospitalItem[];
  page: number;
  pageSize: number;
  totalCount: number;
}
