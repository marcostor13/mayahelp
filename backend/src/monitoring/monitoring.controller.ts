import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

@Controller('monitoring')
@Roles(Role.ADMIN, Role.AGENT)
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  /** Health of every project, for the monitoring index. */
  @Get('overview')
  overview() {
    return this.monitoringService.overview();
  }

  @Get('projects/:projectId')
  projectDashboard(
    @Param('projectId') projectId: string,
    @Query('hours') hours?: string,
  ) {
    const windowHours = Math.min(Math.max(Number(hours) || 24, 1), 720);
    return this.monitoringService.projectDashboard(projectId, windowHours);
  }

  @Get('projects/:projectId/connections')
  listConnections(@Param('projectId') projectId: string) {
    return this.monitoringService.findByProject(projectId);
  }

  @Post('connections')
  @Roles(Role.ADMIN)
  create(
    @Body() dto: CreateConnectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.monitoringService.create(dto, user.userId);
  }

  @Patch('connections/:id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateConnectionDto) {
    return this.monitoringService.update(id, dto);
  }

  @Delete('connections/:id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.monitoringService.remove(id);
  }

  /** Runs the probe right now — used by the "probar conexión" button. */
  @Post('connections/:id/check')
  check(@Param('id') id: string) {
    return this.monitoringService.runCheckById(id);
  }
}
