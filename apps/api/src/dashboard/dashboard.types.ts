import type { StatusHistoryEntityType } from '../generated/prisma/enums';

export interface DashboardStatusChange {
  id: string;
  entityType: StatusHistoryEntityType;
  entityId: string;
  businessNumber: string;
  deviceName: string;
  statusCode: string;
  label: string;
  changedAt: Date;
}

export interface DashboardUpcomingInspection {
  id: string;
  businessNumber: string;
  deviceName: string;
  departmentName: string | null;
  dueAt: Date;
  daysUntilDue: number;
}

export interface DashboardSummary {
  openRepairs: number;
  overdueInspections: number;
  inspectionsNext30Days: number;
  devices: number;
  recentStatusChanges: DashboardStatusChange[];
  upcomingInspections: DashboardUpcomingInspection[];
}
