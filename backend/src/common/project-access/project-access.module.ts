import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../../users/schemas/user.schema';
import { ProjectAccessService } from './project-access.service';

/**
 * Se registra el modelo de usuarios (no `UsersModule`) para que cualquier módulo por
 * proyecto pueda importar esto sin armar un ciclo con el módulo de usuarios.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  providers: [ProjectAccessService],
  exports: [ProjectAccessService],
})
export class ProjectAccessModule {}
