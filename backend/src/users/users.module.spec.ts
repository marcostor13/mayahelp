import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UsersModule } from './users.module';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';
import { Ticket } from '../tickets/schemas/ticket.schema';
import { ProjectShareLink } from '../projects/schemas/project-share-link.schema';
import { Project } from '../projects/schemas/project.schema';
import { AppSettings } from '../app-settings/schemas/app-settings.schema';
import configuration from '../config/configuration';

const MODELS = [
  User.name,
  Ticket.name,
  ProjectShareLink.name,
  Project.name,
  AppSettings.name,
];

/**
 * Compila el grafo de inyección de UsersModule con Mongo fuera del medio.
 *
 * Los tests unitarios construyen los servicios a mano, así que un error de cableado
 * (un provider sin exportar, un módulo que falta en `imports`, un ciclo entre módulos)
 * no aparecería hasta el arranque en producción. Esto lo detecta acá.
 */
describe('UsersModule', () => {
  it('resuelve UsersService con sus dependencias', async () => {
    const builder = Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        UsersModule,
      ],
    })
      .overrideProvider(getConnectionToken())
      .useValue({});

    for (const model of MODELS) {
      builder
        .overrideProvider(getModelToken(model))
        .useValue({} as Model<unknown>);
    }

    const moduleRef = await builder.compile();

    expect(moduleRef.get(UsersService)).toBeInstanceOf(UsersService);
    await moduleRef.close();
  });
});
