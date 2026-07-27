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

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    AdminHospitalsModule,
    AdminUsersModule,
    PortalHospitalsModule,
    DevicesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
