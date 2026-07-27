import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PortalHospitalsModule } from '../portal-hospitals/portal-hospitals.module';
import { PortalUserGuard } from '../portal-hospitals/portal-user.guard';
import { RepairsController } from './repairs.controller';
import { RepairsService } from './repairs.service';

@Module({
  imports: [AuthModule, PortalHospitalsModule],
  controllers: [RepairsController],
  providers: [RepairsService, PortalUserGuard],
})
export class RepairsModule {}
