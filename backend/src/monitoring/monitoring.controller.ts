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
import { ProjectAccessService } from '../common/project-access/project-access.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

@Controller('monitoring')
@Roles(Role.ADMIN, Role.AGENT)
export class MonitoringController {
  constructor(
    private readonly monitoringService: MonitoringService,
    private readonly access: ProjectAccessService,
  ) {}

  /** Health of every project the caller can see, for the monitoring index. */
  @Get('overview')
  async overview(@CurrentUser() user: AuthenticatedUser) {
    return this.monitoringService.overview(
      await this.access.referenceFilter(user, 'project'),
    );
  }

  @Get('projects/:projectId')
  async projectDashboard(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('hours') hours?: string,
  ) {
    await this.access.assertAccess(user, projectId);
    const windowHours = Math.min(Math.max(Number(hours) || 24, 1), 720);
    return this.monitoringService.projectDashboard(projectId, windowHours);
  }

  @Get('projects/:projectId/connections')
  async listConnections(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.access.assertAccess(user, projectId);
    return this.monitoringService.findByProject(projectId);
  }

  @Post('connections')
  @Roles(Role.ADMIN)
  async create(
    @Body() dto: CreateConnectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.access.assertAccess(user, dto.project);
    return this.monitoringService.create(dto, user.userId);
  }

  @Patch('connections/:id')
  @Roles(Role.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateConnectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertConnectionAccess(user, id);
    return this.monitoringService.update(id, dto);
  }

  @Delete('connections/:id')
  @Roles(Role.ADMIN)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertConnectionAccess(user, id);
    return this.monitoringService.remove(id);
  }

  /** Runs the probe right now — used by the "probar conexión" button. */
  @Post('connections/:id/check')
  async check(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.assertConnectionAccess(user, id);
    return this.monitoringService.runCheckById(id);
  }

  private async assertConnectionAccess(
    user: AuthenticatedUser,
    connectionId: string,
  ): Promise<void> {
    const projectId =
      await this.monitoringService.findConnectionProjectId(connectionId);
    await this.access.assertAccess(user, projectId);
  }
}
