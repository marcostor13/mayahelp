import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { Role } from '../common/enums/role.enum';

/**
 * Deja la base consistente con el modelo de permisos por proyecto cada vez que
 * arranca la API:
 *
 * 1. La cuenta de `SUPER_ADMIN_EMAIL` queda como admin activo y con el flag puesto,
 *    y se lo saca a cualquier otra: el súper usuario es uno solo.
 * 2. Backfill por única vez de `projects`. Las cuentas que ya existían antes de esta
 *    pantalla no tienen el campo; al equipo (admin y agente) se le asignan todos los
 *    proyectos de ese momento para que no pierdan acceso de golpe, y a los clientes
 *    una lista vacía. Corre una sola vez porque después el campo ya existe.
 */
@Injectable()
export class SuperAdminBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(SuperAdminBootstrap.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Project.name)
    private readonly projectModel: Model<ProjectDocument>,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureSuperAdmin();
    await this.backfillProjectAssignments();
  }

  private async ensureSuperAdmin(): Promise<void> {
    const email = (
      this.configService.get<string>('superAdminEmail') ?? ''
    ).toLowerCase();
    if (!email) {
      this.logger.warn(
        'SUPER_ADMIN_EMAIL vacío: no hay súper usuario definido.',
      );
      return;
    }

    const demoted = await this.userModel
      .updateMany(
        { isSuperAdmin: true, email: { $ne: email } },
        { $set: { isSuperAdmin: false } },
      )
      .exec();
    if (demoted.modifiedCount > 0) {
      this.logger.warn(
        `Se quitó el flag de súper usuario a ${demoted.modifiedCount} cuenta(s) que ya no son ${email}.`,
      );
    }

    const promoted = await this.userModel
      .findOneAndUpdate(
        { email },
        { $set: { isSuperAdmin: true, role: Role.ADMIN, isActive: true } },
        { new: true },
      )
      .exec();

    if (promoted) {
      this.logger.log(`Súper usuario: ${email}`);
    } else {
      // No se crea sola: sin contraseña conocida sería una cuenta muerta. En cuanto
      // exista — alta desde Usuarios o registro — `createWithPassword` la promueve.
      this.logger.warn(
        `Todavía no existe la cuenta ${email}; se promueve sola en cuanto se cree.`,
      );
    }
  }

  private async backfillProjectAssignments(): Promise<void> {
    const pending = await this.userModel
      .countDocuments({ projects: { $exists: false } })
      .exec();
    if (pending === 0) return;

    const projectIds = (
      await this.projectModel.find({}, '_id').lean().exec()
    ).map((project) => project._id);

    const staff = await this.userModel
      .updateMany(
        {
          projects: { $exists: false },
          role: { $in: [Role.ADMIN, Role.AGENT] },
        },
        { $set: { projects: projectIds } },
      )
      .exec();
    const rest = await this.userModel
      .updateMany({ projects: { $exists: false } }, { $set: { projects: [] } })
      .exec();

    this.logger.log(
      `Backfill de proyectos: ${staff.modifiedCount} cuenta(s) del equipo con los ${projectIds.length} proyectos existentes, ${rest.modifiedCount} sin asignaciones.`,
    );
  }
}
