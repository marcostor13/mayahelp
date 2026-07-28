import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Project, ProjectSchema } from './schemas/project.schema';
import {
  ProjectShareLink,
  ProjectShareLinkSchema,
} from './schemas/project-share-link.schema';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { ShareLinksController } from './share-links.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: ProjectShareLink.name, schema: ProjectShareLinkSchema },
    ]),
  ],
  controllers: [ProjectsController, ShareLinksController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
