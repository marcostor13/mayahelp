import { Module } from '@nestjs/common';
import { WhatsAppTemplatesService } from './whatsapp-templates.service';
import { WhatsAppTemplatesController } from './whatsapp-templates.controller';

@Module({
  controllers: [WhatsAppTemplatesController],
  providers: [WhatsAppTemplatesService],
  exports: [WhatsAppTemplatesService],
})
export class WhatsAppTemplatesModule {}
