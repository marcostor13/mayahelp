import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ReporterInputDto } from './dto/reporter-input.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessService } from '../common/project-access/project-access.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

/**
 * Las rutas van por id de enlace, así que el acceso se resuelve subiendo del enlace a
 * su proyecto: un agente no toca los enlaces de un proyecto que no tiene asignado.
 */
@Controller('project-share-links')
@Roles(Role.ADMIN, Role.AGENT)
export class ShareLinksController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly access: ProjectAccessService,
  ) {}

  @Patch(':id')
  async setActive(
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertLinkAccess(user, id);
    return this.projectsService.setShareLinkActive(id, isActive);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertLinkAccess(user, id);
    return this.projectsService.removeShareLink(id);
  }

  @Post(':id/reporters')
  async addReporter(
    @Param('id') id: string,
    @Body() dto: ReporterInputDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertLinkAccess(user, id);
    return this.projectsService.addReporter(id, dto);
  }

  @Delete(':id/reporters/:reporterId')
  async removeReporter(
    @Param('id') id: string,
    @Param('reporterId') reporterId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertLinkAccess(user, id);
    return this.projectsService.removeReporter(id, reporterId);
  }

  private async assertLinkAccess(
    user: AuthenticatedUser,
    linkId: string,
  ): Promise<void> {
    const projectId = await this.projectsService.findShareLinkProjectId(linkId);
    await this.access.assertAccess(user, projectId);
  }
}
