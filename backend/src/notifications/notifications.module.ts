import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { WhatsAppService } from './whatsapp.service';
import { NotificationsService } from './notifications.service';

@Module({
  providers: [EmailService, WhatsAppService, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
