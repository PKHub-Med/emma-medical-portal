import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PortalHospitalsModule } from '../portal-hospitals/portal-hospitals.module';
import { PortalUserGuard } from '../portal-hospitals/portal-user.guard';
import { DepartmentsService } from './departments.service';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  imports: [AuthModule, PortalHospitalsModule],
  controllers: [DevicesController],
  providers: [DevicesService, DepartmentsService, PortalUserGuard],
})
export class DevicesModule {}
