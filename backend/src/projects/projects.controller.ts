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
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

@Controller('projects')
@Roles(Role.ADMIN, Role.AGENT)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  @Post()
  create(
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectsService.create(dto, user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectsService.findById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.projectsService.remove(id);
  }

  @Get(':id/share-links')
  listShareLinks(@Param('id') id: string) {
    return this.projectsService.findShareLinksForProject(id);
  }

  @Post(':id/share-links')
  createShareLink(
    @Param('id') id: string,
    @Body() dto: CreateShareLinkDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectsService.createShareLink(id, dto, user.userId);
  }
}
