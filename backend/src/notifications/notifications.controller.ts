import { Controller, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('settings/notifications')
@Roles(Role.ADMIN)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** Fires a sample notification with the saved settings so the admin can verify them. */
  @Post('test')
  sendTest() {
    return this.notificationsService.sendTestNotification();
  }
}
