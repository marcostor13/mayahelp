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
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

@Controller('implementations')
@Roles(Role.ADMIN, Role.AGENT)
export class ImplementationsController {
  constructor(private readonly implementations: ImplementationsService) {}

  @Get('projects/:projectId/repo')
  getRepo(@Param('projectId') projectId: string) {
    return this.implementations.getRepo(projectId);
  }

  @Put('projects/:projectId/repo')
  @Roles(Role.ADMIN)
  saveRepo(@Param('projectId') projectId: string, @Body() dto: SaveRepoDto) {
    return this.implementations.saveRepo(projectId, dto);
  }

  @Delete('projects/:projectId/repo')
  @Roles(Role.ADMIN)
  @HttpCode(204)
  async removeRepo(@Param('projectId') projectId: string): Promise<void> {
    await this.implementations.removeRepo(projectId);
  }

  @Get()
  list(@Query('project') project?: string, @Query('limit') limit?: string) {
    return this.implementations.list(project, Number(limit) || 50);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.implementations.findById(id);
  }

  @Post()
  trigger(@Body() dto: TriggerRunDto, @CurrentUser() user: AuthenticatedUser) {
    return this.implementations.trigger(dto, user, user.email);
  }

  /** Forces a refresh against GitHub instead of waiting for the scheduler. */
  @Post(':id/sync')
  sync(@Param('id') id: string) {
    return this.implementations.syncById(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.implementations.cancel(id);
  }
}
