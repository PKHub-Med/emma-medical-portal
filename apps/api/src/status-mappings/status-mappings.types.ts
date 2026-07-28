import type { StatusMappingSourceEntityType } from '../generated/prisma/enums';

export interface StatusMappingsQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  sourceEntityType?: string;
  active?: string;
  sendEmail?: string;
}

export interface StatusMappingItem {
  id: string;
  sourceEntityType: StatusMappingSourceEntityType;
  sourceStatus: string;
  customerStatusCode: string;
  customerLabel: string;
  emailTemplateId: string | null;
  sendEmail: boolean;
  isTerminal: boolean;
  requiresAction: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StatusMappingsPage {
  items: StatusMappingItem[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export type ResolvedStatusMapping =
  | { recognized: false }
  | {
      recognized: true;
      customerStatusCode: string;
      customerLabel: string;
      emailTemplateId: string | null;
      sendEmail: boolean;
      isTerminal: boolean;
      requiresAction: boolean;
    };
