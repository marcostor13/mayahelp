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
import { ProjectAccessModule } from '../common/project-access/project-access.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: ProjectShareLink.name, schema: ProjectShareLinkSchema },
    ]),
    ProjectAccessModule,
    // Para asignarle el proyecto a quien lo crea. No es circular: UsersModule no
    // importa ProjectsModule, registra los modelos que necesita por su cuenta.
    UsersModule,
  ],
  controllers: [ProjectsController, ShareLinksController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
