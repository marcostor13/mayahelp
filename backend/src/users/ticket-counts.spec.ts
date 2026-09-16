import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { UsersService } from './users.service';
import { UserDocument } from './schemas/user.schema';
import { TicketDocument } from '../tickets/schemas/ticket.schema';
import { ProjectShareLinkDocument } from '../projects/schemas/project-share-link.schema';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { ProjectAccessService } from '../common/project-access/project-access.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { Role } from '../common/enums/role.enum';

const VIEWER_ID = new Types.ObjectId().toString();
const ANDREA_ID = new Types.ObjectId();
const PROJECT_A = new Types.ObjectId();

function requester(isSuperAdmin = false): AuthenticatedUser {
  return {
    userId: VIEWER_ID,
    email: 'quien@mayahelp.com',
    role: Role.ADMIN,
    isSuperAdmin,
    mustChangePassword: false,
  };
}

/**
 * Captura el `$match` con el que se cuentan los tickets de cada persona, que es donde
 * se decide si el número de la pantalla coincide con lo que después se puede abrir.
 */
function capturingService(viewerProjects: Types.ObjectId[], visibles = 5) {
  let matched: Record<string, unknown> | undefined;
  let totalMatch: Record<string, unknown> | undefined;

  const userModel = {
    find: () => ({
      sort: () => ({
        lean: () => ({
          exec: () =>
            Promise.resolve([
              { _id: ANDREA_ID, name: 'Andrea', email: 'a@b.com' },
            ]),
        }),
      }),
    }),
  } as unknown as Model<UserDocument>;

  // `visibles` es lo que devuelve la vuelta con recorte; `total`, la de control.
  const ticketModel = {
    aggregate: (pipeline: { $match?: Record<string, unknown> }[]) => {
      const match = pipeline[0].$match ?? {};
      const acotada = '$and' in match;
      if (acotada) matched = match;
      else totalMatch = match;
      return {
        exec: () =>
          Promise.resolve([{ _id: ANDREA_ID, total: acotada ? visibles : 5 }]),
      };
    },
  } as unknown as Model<TicketDocument>;

  const access = new ProjectAccessService({
    findById: () => ({
      lean: () => ({
        exec: () => Promise.resolve({ projects: viewerProjects }),
      }),
    }),
  } as unknown as Model<UserDocument>);

  const service = new UsersService(
    userModel,
    ticketModel,
    {} as unknown as Model<ProjectShareLinkDocument>,
    {} as unknown as Model<ProjectDocument>,
    {} as unknown as NotificationsService,
    { get: () => '' } as unknown as ConfigService,
    access,
  );

  return { service, matchFor: () => matched ?? totalMatch };
}

/**
 * El caso real: la pantalla decía "5 tickets" y al entrar no aparecía ninguno, porque
 * esos cinco eran de un proyecto que quien miraba no tenía asignado. Un número que no
 * se puede abrir es peor que no mostrar número.
 */
describe('UsersService.findAllWithTicketCounts — el conteo respeta el alcance', () => {
  it('cuenta con el mismo recorte que usa la lista de tickets', async () => {
    const { service, matchFor } = capturingService([PROJECT_A]);

    await service.findAllWithTicketCounts({}, requester());

    expect(matchFor()).toEqual({
      $and: [
        {
          $or: [
            { project: { $in: [PROJECT_A] } },
            { client: new Types.ObjectId(VIEWER_ID) },
            { project: null },
          ],
        },
      ],
      client: { $in: [ANDREA_ID] },
    });
  });

  it('al súper usuario le cuenta todo, sin recorte', async () => {
    const { service, matchFor } = capturingService([]);

    await service.findAllWithTicketCounts({}, requester(true));

    expect(matchFor()).toEqual({ client: { $in: [ANDREA_ID] } });
  });

  it('devuelve el total que salió del conteo', async () => {
    const { service } = capturingService([PROJECT_A]);

    const users = await service.findAllWithTicketCounts({}, requester());

    expect(users[0].ticketsCount).toBe(5);
  });

  /**
   * El caso de Andrea: tiene 5 y quien mira no ve ninguno. Mostrar "0" a secas deja
   * el misterio; el segundo número es lo que convierte el 0 en una explicación.
   */
  it('reporta cuántos quedan fuera del alcance de quien mira', async () => {
    const { service } = capturingService([PROJECT_A], 0);

    const users = await service.findAllWithTicketCounts({}, requester());

    expect(users[0].ticketsCount).toBe(0);
    expect(users[0].ticketsOutOfScope).toBe(5);
  });

  it('al súper usuario nunca le esconde ninguno', async () => {
    const { service } = capturingService([], 5);

    const users = await service.findAllWithTicketCounts({}, requester(true));

    expect(users[0].ticketsOutOfScope).toBe(0);
  });
});
