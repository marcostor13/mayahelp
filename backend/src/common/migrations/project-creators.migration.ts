import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import {
  Project,
  ProjectDocument,
} from '../../projects/schemas/project.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';

/** Registro de las migraciones de una sola vez que ya corrieron. */
export const MIGRATIONS_COLLECTION = 'migrations';
export const PROJECT_CREATORS_MIGRATION = 'project-creators-access';

/**
 * Por única vez, le asigna a cada quien los proyectos que creó.
 *
 * Crear un proyecto no se lo asignaba a su creador, y como los proyectos se ven por
 * asignación, le quedaba invisible: parecía que no se había creado y se reintentaba
 * (así quedaron proyectos duplicados). `ProjectsService.create` ya lo asigna al crear;
 * esto pone al día los que se crearon antes.
 *
 * Corre una sola vez y queda anotada en `migrations`: si después alguien saca a un
 * creador de su proyecto a propósito, un reinicio no lo vuelve a meter.
 *
 * Va en `onApplicationBootstrap` para correr después de `ReferenceIdsMigration`: con
 * `createdBy` y `projects` todavía en texto, el filtro no encontraría a nadie.
 */
@Injectable()
export class ProjectCreatorsMigration implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProjectCreatorsMigration.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Project.name)
    private readonly projectModel: Model<ProjectDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const migrations = this.connection.collection<{
      _id: string;
      appliedAt: Date;
    }>(MIGRATIONS_COLLECTION);
    if (await migrations.findOne({ _id: PROJECT_CREATORS_MIGRATION })) return;

    const projects = await this.projectModel
      .find({ createdBy: { $ne: null } }, 'createdBy')
      .lean()
      .exec();
    const operations = projects.map((project) => ({
      updateOne: {
        filter: {
          _id: project.createdBy,
          // El súper usuario ya ve todo. Una cuenta sin `projects` la completa
          // `SuperAdminBootstrap` con todos los proyectos.
          isSuperAdmin: { $ne: true },
          projects: { $exists: true, $ne: project._id },
        },
        update: { $addToSet: { projects: project._id } },
      },
    }));
    const assigned = operations.length
      ? (await this.userModel.bulkWrite(operations)).modifiedCount
      : 0;

    await migrations.insertOne({
      _id: PROJECT_CREATORS_MIGRATION,
      appliedAt: new Date(),
    });
    this.logger.log(
      `${assigned} proyecto(s) asignado(s) a quien los creó y no los veía.`,
    );
  }
}
