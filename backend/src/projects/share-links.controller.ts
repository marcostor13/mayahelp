import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ReporterInputDto } from './dto/reporter-input.dto';
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

  @Post(':id/reporters')
  addReporter(@Param('id') id: string, @Body() dto: ReporterInputDto) {
    return this.projectsService.addReporter(id, dto);
  }

  @Delete(':id/reporters/:reporterId')
  removeReporter(
    @Param('id') id: string,
    @Param('reporterId') reporterId: string,
  ) {
    return this.projectsService.removeReporter(id, reporterId);
  }
}
