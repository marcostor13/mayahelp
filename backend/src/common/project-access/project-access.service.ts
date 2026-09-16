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
   * Qué tickets ve cada cuenta. Se suman tres cosas, y alcanza con una:
   *
   * - los tickets de los proyectos que tiene asignados, los haya abierto quien sea:
   *   es lo que hace que asignar un proyecto signifique algo;
   * - los que abrió ella misma, siempre, tenga o no el proyecto asignado — nadie
   *   pierde de vista un ticket propio;
   * - los que **no** tienen proyecto, pero solo para el equipo: es el buzón general
   *   de lo que todavía nadie clasificó. Al cliente no le corresponde.
   *
   * Va en `$and` para poder convivir con el `$or` de la búsqueda por texto.
   */
  async ticketScopeFilter(
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const ids = await this.visibleProjectIds(user);
    if (ids === null) return {};

    const clauses: Record<string, unknown>[] = [
      { project: { $in: ids.map(toObjectId) } },
      { client: toObjectId(user.userId) },
    ];
    if (user.role !== Role.CLIENT) {
      clauses.push({ project: null });
    }
    return { $and: [{ $or: clauses }] };
  }

  /**
   * La misma regla que `ticketScopeFilter`, para un ticket puntual. El dueño del
   * ticket queda fuera de acá: lo resuelve `TicketsService`, que es quien sabe de
   * quién es el ticket.
   */
  async canAccessTicketProject(
    user: AuthenticatedUser,
    projectId: string | Types.ObjectId | null | undefined,
  ): Promise<boolean> {
    // Sin proyecto es el buzón general: del equipo, no del cliente.
    if (!projectId) return user.role !== Role.CLIENT || user.isSuperAdmin;
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
