import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AdminHospitalsService } from './admin-hospitals.service';
import type {
  HospitalItem,
  HospitalsPage,
  HospitalsQuery,
} from './admin-hospitals.types';
import { EmmaAdminGuard } from './emma-admin.guard';

@Controller('admin/hospitals')
@UseGuards(SessionAuthGuard, EmmaAdminGuard)
export class AdminHospitalsController {
  constructor(
    private readonly hospitalsService: AdminHospitalsService,
  ) {}

  @Get()
  list(@Query() query: HospitalsQuery): Promise<HospitalsPage> {
    return this.hospitalsService.list(query);
  }

  @Post()
  create(@Body() body: unknown): Promise<HospitalItem> {
    return this.hospitalsService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<HospitalItem> {
    return this.hospitalsService.update(id, body);
  }
}
