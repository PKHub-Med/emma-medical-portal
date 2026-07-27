import type {
  MembershipRole,
  SystemRole,
  UserStatus,
} from '../generated/prisma/enums';

export interface AdminUsersQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  status?: string;
  hospitalId?: string;
  includeDeleted?: string;
}

export interface AdminMembershipItem {
  id: string;
  hospitalId: string;
  hospitalName: string;
  departmentId: string | null;
  role: MembershipRole;
}

export interface AdminUserItem {
  id: string;
  email: string;
  status: UserStatus;
  systemRole: SystemRole;
  lastLoginAt: Date | null;
  createdAt: Date;
  memberships: AdminMembershipItem[];
}

export interface CreateAdminUserResult {
  user: AdminUserItem;
  restored: boolean;
}

export interface AdminUsersPage {
  items: AdminUserItem[];
  page: number;
  pageSize: number;
  totalCount: number;
}
