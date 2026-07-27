import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminHospitalsController } from './admin-hospitals.controller';
import { AdminHospitalsService } from './admin-hospitals.service';
import { EmmaAdminGuard } from './emma-admin.guard';

@Module({
  imports: [AuthModule],
  controllers: [AdminHospitalsController],
  providers: [AdminHospitalsService, EmmaAdminGuard],
})
export class AdminHospitalsModule {}
