import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReferenceIdsMigration } from './reference-ids.migration';
import { ProjectCreatorsMigration } from './project-creators.migration';
import { Project, ProjectSchema } from '../../projects/schemas/project.schema';
import { User, UserSchema } from '../../users/schemas/user.schema';

/** Arreglos de datos que corren solos al arrancar, antes de aceptar requests. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [ReferenceIdsMigration, ProjectCreatorsMigration],
})
export class MigrationsModule {}
