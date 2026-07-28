import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminHospitalsModule } from './admin-hospitals/admin-hospitals.module';
import { AdminUsersModule } from './admin-users/admin-users.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { PortalHospitalsModule } from './portal-hospitals/portal-hospitals.module';
import { AuditModule } from './audit/audit.module';
import { DevicesModule } from './devices/devices.module';
import { RepairsModule } from './repairs/repairs.module';
import { InspectionsModule } from './inspections/inspections.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { StatusMappingsModule } from './status-mappings/status-mappings.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    AdminHospitalsModule,
    AdminUsersModule,
    PortalHospitalsModule,
    DevicesModule,
    RepairsModule,
    InspectionsModule,
    DashboardModule,
    StatusMappingsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
