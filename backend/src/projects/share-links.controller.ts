import { Body, Controller, Delete, Param, Patch } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('project-share-links')
@Roles(Role.ADMIN, Role.AGENT)
export class ShareLinksController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Patch(':id')
  setActive(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.projectsService.setShareLinkActive(id, isActive);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.projectsService.removeShareLink(id);
  }
}
