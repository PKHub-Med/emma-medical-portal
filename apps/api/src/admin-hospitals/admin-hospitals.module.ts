import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminHospitalsController } from './admin-hospitals.controller';
import { AdminHospitalsService } from './admin-hospitals.service';
import { EmmaAdminGuard } from './emma-admin.guard';
import { HospitalCommunicationController } from './hospital-communication.controller';
import { HospitalCommunicationService } from './hospital-communication.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminHospitalsController, HospitalCommunicationController],
  providers: [
    AdminHospitalsService,
    HospitalCommunicationService,
    EmmaAdminGuard,
  ],
})
export class AdminHospitalsModule {}
