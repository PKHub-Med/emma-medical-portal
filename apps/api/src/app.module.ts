import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminHospitalsModule } from './admin-hospitals/admin-hospitals.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuthModule, AdminHospitalsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
