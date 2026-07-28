import type {
  EmailDeliveryStatus,
  NotificationEntityType,
  NotificationEventStatus,
} from '../generated/prisma/enums';

export interface CreateStatusChangedEventInput {
  entityType: NotificationEntityType;
  entityId: string;
  customerStatusCode: string;
  customerLabel: string;
  version: string;
  occurredAt: Date;
}

export interface AdminEmailsQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  hospitalId?: string;
  entityType?: string;
  eventStatus?: string;
  deliveryStatus?: string;
  recipient?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface NotificationPayload {
  businessNumber: string;
  customerStatusCode: string;
  customerLabel: string;
  deviceId: string;
  deviceName: string;
  serialNo: string | null;
  inventoryNo: string | null;
  occurredAt: string;
}

export interface NotificationRecipient {
  contactId: string;
  email: string;
  name: string | null;
}

export type NotificationEventListItem = {
  id: string;
  eventKey: string;
  eventType: 'STATUS_CHANGED';
  entityType: NotificationEntityType;
  entityId: string;
  businessNumber: string;
  customerLabel: string;
  status: NotificationEventStatus;
  blockedReasonCode: string | null;
  blockedReasonMessage: string | null;
  hospital: { id: string; name: string };
  occurredAt: Date;
  createdAt: Date;
  deliveries: Array<{
    id: string;
    recipientEmail: string;
    recipientName: string | null;
    status: EmailDeliveryStatus;
    attempts: number;
    providerId: string | null;
    lastErrorMessage: string | null;
  }>;
};
