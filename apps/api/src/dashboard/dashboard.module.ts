import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PortalHospitalsModule } from '../portal-hospitals/portal-hospitals.module';
import { PortalUserGuard } from '../portal-hospitals/portal-user.guard';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AuthModule, PortalHospitalsModule],
  controllers: [DashboardController],
  providers: [DashboardService, PortalUserGuard],
})
export class DashboardModule {}
