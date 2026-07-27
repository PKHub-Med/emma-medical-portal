import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CurrentHospitalScope } from './current-hospital-scope.service';
import { PortalHospitalsController } from './portal-hospitals.controller';
import { PortalHospitalsService } from './portal-hospitals.service';
import { PortalUserGuard } from './portal-user.guard';

@Module({
  imports: [AuthModule],
  controllers: [PortalHospitalsController],
  providers: [
    PortalHospitalsService,
    PortalUserGuard,
    CurrentHospitalScope,
  ],
  exports: [CurrentHospitalScope],
})
export class PortalHospitalsModule {}
