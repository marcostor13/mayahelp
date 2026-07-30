import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { WhatsAppService } from './whatsapp.service';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { AppSettingsModule } from '../app-settings/app-settings.module';

@Module({
  imports: [AppSettingsModule],
  controllers: [NotificationsController],
  providers: [EmailService, WhatsAppService, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
