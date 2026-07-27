import type {
  MembershipRole,
  SystemRole,
  UserStatus,
} from '../generated/prisma/enums';

export interface LoginBody {
  email?: unknown;
  password?: unknown;
}

export interface MembershipProfile {
  hospitalId: string;
  hospitalName: string;
  departmentId: string | null;
  role: MembershipRole;
}

export interface ActiveHospitalProfile {
  id: string;
  name: string;
  role: MembershipRole;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  status: UserStatus;
  systemRole: SystemRole;
  memberships: MembershipProfile[];
  activeHospital?: ActiveHospitalProfile | null;
}

export interface AuthenticatedContext {
  user: AuthenticatedUser;
  sessionId: string;
}
