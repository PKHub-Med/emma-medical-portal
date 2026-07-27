import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmmaAdminGuard } from '../admin-hospitals/emma-admin.guard';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersService, EmmaAdminGuard],
})
export class AdminUsersModule {}
