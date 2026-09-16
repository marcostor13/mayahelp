import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateShareLinkDto } from './dto/create-share-link.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessService } from '../common/project-access/project-access.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

/**
 * Leer proyectos lo puede hacer cualquier cuenta con sesión, pero siempre acotado a
 * los que tiene asignados (`ProjectAccessService`). Crear, editar y borrar sigue
 * siendo del equipo.
 */
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly access: ProjectAccessService,
  ) {}

  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.findAll(
      await this.access.projectIdFilter(user),
    );
  }

  @Post()
  @Roles(Role.ADMIN, Role.AGENT)
  create(
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectsService.create(dto, user.userId);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.access.assertAccess(user, id);
    return this.projectsService.findById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.AGENT)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.access.assertAccess(user, id);
    return this.projectsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.access.assertAccess(user, id);
    return this.projectsService.remove(id);
  }

  @Get(':id/share-links')
  @Roles(Role.ADMIN, Role.AGENT)
  async listShareLinks(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.access.assertAccess(user, id);
    return this.projectsService.findShareLinksForProject(id);
  }

  @Post(':id/share-links')
  @Roles(Role.ADMIN, Role.AGENT)
  async createShareLink(
    @Param('id') id: string,
    @Body() dto: CreateShareLinkDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.access.assertAccess(user, id);
    return this.projectsService.createShareLink(id, dto, user.userId);
  }
}
