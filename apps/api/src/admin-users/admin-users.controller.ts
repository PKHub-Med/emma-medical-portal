import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { EmmaAdminGuard } from '../admin-hospitals/emma-admin.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { auditContextFromRequest } from '../audit/audit-request';
import { AdminUsersService } from './admin-users.service';
import type {
  AdminMembershipItem,
  AdminUserItem,
  CreateAdminUserResult,
  AdminUsersPage,
  AdminUsersQuery,
} from './admin-users.types';

@Controller('admin/users')
@UseGuards(SessionAuthGuard, EmmaAdminGuard)
export class AdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  @Get()
  list(@Query() query: AdminUsersQuery): Promise<AdminUsersPage> {
    return this.usersService.list(query);
  }

  @Post()
  create(
    @Body() body: unknown,
    @Req() request?: AuthenticatedRequest,
  ): Promise<CreateAdminUserResult> {
    return this.usersService.create(
      body,
      request?.currentUser?.id,
      request ? auditContextFromRequest(request) : {},
    );
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminUserItem> {
    return this.usersService.updateStatus(
      id,
      body,
      request.currentUser!.id,
      auditContextFromRequest(request),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  deleteUser(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    return this.usersService.deleteUser(
      id,
      request.currentUser!.id,
      auditContextFromRequest(request),
    );
  }

  @Post(':id/memberships')
  addMembership(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request?: AuthenticatedRequest,
  ): Promise<AdminMembershipItem> {
    return this.usersService.addMembership(
      id,
      body,
      request?.currentUser?.id,
      request ? auditContextFromRequest(request) : {},
    );
  }

  @Patch(':userId/memberships/:membershipId')
  updateMembership(
    @Param('userId') userId: string,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
    @Req() request?: AuthenticatedRequest,
  ): Promise<AdminMembershipItem> {
    return this.usersService.updateMembership(
      userId,
      membershipId,
      body,
      request?.currentUser?.id,
      request ? auditContextFromRequest(request) : {},
    );
  }

  @Delete(':userId/memberships/:membershipId')
  @HttpCode(204)
  deleteMembership(
    @Param('userId') userId: string,
    @Param('membershipId') membershipId: string,
    @Req() request?: AuthenticatedRequest,
  ): Promise<void> {
    return this.usersService.deleteMembership(
      userId,
      membershipId,
      request?.currentUser?.id,
      request ? auditContextFromRequest(request) : {},
    );
  }
}
