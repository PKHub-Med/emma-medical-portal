import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { auditContextFromRequest } from '../audit/audit-request';
import { EmmaAdminGuard } from './emma-admin.guard';
import { HospitalCommunicationService } from './hospital-communication.service';
import type {
  CommunicationConfiguration,
  ContactItem,
  ContactsPage,
  ContactsQuery,
} from './hospital-communication.types';

@Controller('admin/hospitals/:hospitalId')
@UseGuards(SessionAuthGuard, EmmaAdminGuard)
export class HospitalCommunicationController {
  constructor(private readonly service: HospitalCommunicationService) {}

  @Get('contacts')
  listContacts(
    @Param('hospitalId') hospitalId: string,
    @Query() query: ContactsQuery,
  ): Promise<ContactsPage> {
    return this.service.listContacts(hospitalId, query);
  }

  @Post('contacts')
  createContact(
    @Param('hospitalId') hospitalId: string,
    @Body() body: unknown,
    @Req() request?: AuthenticatedRequest,
  ): Promise<ContactItem> {
    return this.service.createContact(
      hospitalId,
      body,
      request?.currentUser?.id,
      request ? auditContextFromRequest(request) : {},
    );
  }

  @Patch('contacts/:contactId')
  updateContact(
    @Param('hospitalId') hospitalId: string,
    @Param('contactId') contactId: string,
    @Body() body: unknown,
    @Req() request?: AuthenticatedRequest,
  ): Promise<ContactItem> {
    return this.service.updateContact(
      hospitalId,
      contactId,
      body,
      request?.currentUser?.id,
      request ? auditContextFromRequest(request) : {},
    );
  }

  @Get('communication')
  getCommunication(
    @Param('hospitalId') hospitalId: string,
  ): Promise<CommunicationConfiguration> {
    return this.service.getCommunication(hospitalId);
  }

  @Put('communication')
  updateCommunication(
    @Param('hospitalId') hospitalId: string,
    @Body() body: unknown,
    @Req() request?: AuthenticatedRequest,
  ): Promise<CommunicationConfiguration> {
    return this.service.updateCommunication(
      hospitalId,
      body,
      request?.currentUser?.id,
      request ? auditContextFromRequest(request) : {},
    );
  }
}
