import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PortalHospitalsModule } from '../portal-hospitals/portal-hospitals.module';
import { PortalUserGuard } from '../portal-hospitals/portal-user.guard';
import { InspectionsController } from './inspections.controller';
import { InspectionsService } from './inspections.service';

@Module({
  imports: [AuthModule, PortalHospitalsModule],
  controllers: [InspectionsController],
  providers: [InspectionsService, PortalUserGuard],
})
export class InspectionsModule {}
