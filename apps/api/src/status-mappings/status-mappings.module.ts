import { Module } from '@nestjs/common';
import { EmmaAdminGuard } from '../admin-hospitals/emma-admin.guard';
import { AuthModule } from '../auth/auth.module';
import { StatusMappingService } from './status-mapping.service';
import { StatusMappingsController } from './status-mappings.controller';

@Module({
  imports: [AuthModule],
  controllers: [StatusMappingsController],
  providers: [StatusMappingService, EmmaAdminGuard],
  exports: [StatusMappingService],
})
export class StatusMappingsModule {}
