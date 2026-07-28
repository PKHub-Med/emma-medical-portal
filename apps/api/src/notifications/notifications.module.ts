import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmmaAdminGuard } from '../admin-hospitals/emma-admin.guard';
import { AdminEmailsController } from './admin-emails.controller';
import { NotificationEventProcessor } from './notification-event.processor';
import { NotificationEventService } from './notification-event.service';
import { NotificationRecipientResolver } from './notification-recipient.resolver';

@Module({
  imports: [AuthModule],
  controllers: [AdminEmailsController],
  providers: [
    EmmaAdminGuard,
    NotificationRecipientResolver,
    NotificationEventProcessor,
    NotificationEventService,
  ],
  exports: [NotificationEventService, NotificationEventProcessor],
})
export class NotificationsModule {}
