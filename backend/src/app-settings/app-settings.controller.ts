import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { AppSettingsService } from './app-settings.service';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { NOTIFICATION_VARIABLES } from './notification-variables';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('settings')
@Roles(Role.ADMIN)
export class AppSettingsController {
  constructor(private readonly appSettingsService: AppSettingsService) {}

  @Get('notifications')
  async get() {
    const settings = await this.appSettingsService.get();
    return {
      whatsapp: settings.whatsapp,
      email: settings.email,
      events: settings.events,
      availableVariables: NOTIFICATION_VARIABLES,
    };
  }

  /**
   * One-click multi-line template: Meta rejects newlines inside a parameter, so the
   * line breaks have to come from the template body itself.
   */
  @Post('notifications/whatsapp-template-preset')
  async applyTemplatePreset() {
    const { settings, template } =
      await this.appSettingsService.applyTicketTemplatePreset();
    return {
      template,
      whatsapp: settings.whatsapp,
      email: settings.email,
      events: settings.events,
      availableVariables: NOTIFICATION_VARIABLES,
    };
  }

  @Patch('notifications')
  async update(@Body() dto: UpdateNotificationSettingsDto) {
    const settings = await this.appSettingsService.updateNotifications(dto);
    return {
      whatsapp: settings.whatsapp,
      email: settings.email,
      events: settings.events,
      availableVariables: NOTIFICATION_VARIABLES,
    };
  }
}
