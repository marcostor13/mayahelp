import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.interface';
import { Role } from '../enums/role.enum';

/**
 * Qué proyectos ve cada cuenta. La regla es una sola y vale para todos los módulos
 * que cuelgan de un proyecto (proyectos, monitoreo e implementaciones):
 *
 * - el súper usuario ve todos, tenga o no asignaciones;
 * - cualquier otra cuenta ve solo los que le asignaron desde la pantalla de Usuarios
 *   (`user.projects`), sin importar su rol.
 *
 * La lista se lee de la base en cada request a propósito: si viajara en el token, un
 * cambio de asignación tardaría hasta `JWT_ACCESS_EXPIRES_IN` en tener efecto.
 */
@Injectable()
export class ProjectAccessService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  /** Ids visibles, o `null` cuando la persona ve todos los proyectos. */
  async visibleProjectIds(user: AuthenticatedUser): Promise<string[] | null> {
    if (user.isSuperAdmin) {
      return null;
    }
    const doc = await this.userModel
      .findById(user.userId, 'projects')
      .lean()
      .exec();
    return (doc?.projects ?? []).map((id) => id.toString());
  }

  /**
   * Filtro listo para pegarle a un `find` sobre proyectos. Devuelve `{}` para quien
   * los ve todos y `{ $in: [] }` — que no matchea nada — para quien no tiene ninguno.
   */
  async projectIdFilter(
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const ids = await this.visibleProjectIds(user);
    return ids === null ? {} : { _id: { $in: ids.map(toObjectId) } };
  }

  /** Igual que `projectIdFilter` pero sobre documentos que referencian al proyecto. */
  async referenceFilter(
    user: AuthenticatedUser,
    field: string,
  ): Promise<Record<string, unknown>> {
    const ids = await this.visibleProjectIds(user);
    return ids === null ? {} : { [field]: { $in: ids.map(toObjectId) } };
  }

  /**
   * Cómo se acotan los tickets por proyecto:
   *
   * - un ticket **con** proyecto lo ve quien tenga ese proyecto asignado;
   * - un ticket **sin** proyecto es el buzón general del equipo y lo sigue viendo todo
   *   el mundo, como antes de que existieran las asignaciones;
   * - al cliente no se le aplica nada de esto: ya está acotado a los tickets que abrió
   *   él, y filtrarlos además por proyecto le escondería tickets propios.
   *
   * Va en `$and` y no en `$or` para poder convivir con el `$or` de la búsqueda por texto.
   */
  async ticketScopeFilter(
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    if (user.role === Role.CLIENT) return {};
    const ids = await this.visibleProjectIds(user);
    if (ids === null) return {};
    return {
      $and: [
        { $or: [{ project: null }, { project: { $in: ids.map(toObjectId) } }] },
      ],
    };
  }

  /** La misma regla que `ticketScopeFilter`, para un ticket puntual. */
  async canAccessTicketProject(
    user: AuthenticatedUser,
    projectId: string | Types.ObjectId | null | undefined,
  ): Promise<boolean> {
    if (user.role === Role.CLIENT || !projectId) return true;
    return this.canAccess(user, projectId);
  }

  async assertTicketAccess(
    user: AuthenticatedUser,
    projectId: string | Types.ObjectId | null | undefined,
  ): Promise<void> {
    if (!(await this.canAccessTicketProject(user, projectId))) {
      throw new ForbiddenException(
        'No tenés acceso al proyecto de este ticket',
      );
    }
  }

  async canAccess(
    user: AuthenticatedUser,
    projectId: string | Types.ObjectId | null | undefined,
  ): Promise<boolean> {
    const ids = await this.visibleProjectIds(user);
    if (ids === null) return true;
    if (!projectId) return false;
    return ids.includes(projectId.toString());
  }

  async assertAccess(
    user: AuthenticatedUser,
    projectId: string | Types.ObjectId | null | undefined,
  ): Promise<void> {
    if (!(await this.canAccess(user, projectId))) {
      throw new ForbiddenException('No tenés acceso a este proyecto');
    }
  }
}

/** Los ids inválidos se dejan pasar como string: nunca matchean y no tiran error. */
function toObjectId(id: string): Types.ObjectId | string {
  return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id;
}
