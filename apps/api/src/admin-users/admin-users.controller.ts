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
import { AdminUsersService } from './admin-users.service';
import type {
  AdminMembershipItem,
  AdminUserItem,
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
  create(@Body() body: unknown): Promise<AdminUserItem> {
    return this.usersService.create(body);
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
    );
  }

  @Delete(':id')
  @HttpCode(204)
  deleteUser(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    return this.usersService.deleteUser(id, request.currentUser!.id);
  }

  @Post(':id/memberships')
  addMembership(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AdminMembershipItem> {
    return this.usersService.addMembership(id, body);
  }

  @Patch(':userId/memberships/:membershipId')
  updateMembership(
    @Param('userId') userId: string,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
  ): Promise<AdminMembershipItem> {
    return this.usersService.updateMembership(
      userId,
      membershipId,
      body,
    );
  }

  @Delete(':userId/memberships/:membershipId')
  @HttpCode(204)
  deleteMembership(
    @Param('userId') userId: string,
    @Param('membershipId') membershipId: string,
  ): Promise<void> {
    return this.usersService.deleteMembership(userId, membershipId);
  }
}
