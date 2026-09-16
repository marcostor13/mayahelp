import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ImplementationsService } from './implementations.service';
import { SaveRepoDto } from './dto/save-repo.dto';
import { TriggerRunDto } from './dto/trigger-run.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessService } from '../common/project-access/project-access.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

@Controller('implementations')
@Roles(Role.ADMIN, Role.AGENT)
export class ImplementationsController {
  constructor(
    private readonly implementations: ImplementationsService,
    private readonly access: ProjectAccessService,
  ) {}

  @Get('projects/:projectId/repo')
  async getRepo(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.access.assertAccess(user, projectId);
    return this.implementations.getRepo(projectId);
  }

  @Put('projects/:projectId/repo')
  @Roles(Role.ADMIN)
  async saveRepo(
    @Param('projectId') projectId: string,
    @Body() dto: SaveRepoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.access.assertAccess(user, projectId);
    return this.implementations.saveRepo(projectId, dto);
  }

  @Delete('projects/:projectId/repo')
  @Roles(Role.ADMIN)
  @HttpCode(204)
  async removeRepo(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.access.assertAccess(user, projectId);
    await this.implementations.removeRepo(projectId);
  }

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('project') project?: string,
    @Query('limit') limit?: string,
  ) {
    if (project) {
      await this.access.assertAccess(user, project);
    }
    return this.implementations.list(
      project,
      Number(limit) || 50,
      await this.access.referenceFilter(user, 'project'),
    );
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertRunAccess(user, id);
    return this.implementations.findById(id);
  }

  @Post()
  async trigger(
    @Body() dto: TriggerRunDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.access.assertAccess(user, dto.project);
    return this.implementations.trigger(dto, user, user.email);
  }

  /** Forces a refresh against GitHub instead of waiting for the scheduler. */
  @Post(':id/sync')
  async sync(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.assertRunAccess(user, id);
    return this.implementations.syncById(id);
  }

  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertRunAccess(user, id);
    return this.implementations.cancel(id);
  }

  private async assertRunAccess(
    user: AuthenticatedUser,
    runId: string,
  ): Promise<void> {
    await this.access.assertAccess(
      user,
      await this.implementations.findRunProjectId(runId),
    );
  }
}
