export interface ContactsQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  active?: string;
  linked?: string;
}

export interface ContactItem {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  active: boolean;
  linkedUser: { id: string; email: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactsPage {
  items: ContactItem[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface CommunicationConfiguration {
  hospital: { id: string; name: string };
  enabled: boolean;
  primaryContact: ContactItem | null;
  recipients: ContactItem[];
  configurationComplete: boolean;
  configurationWarnings: string[];
}
