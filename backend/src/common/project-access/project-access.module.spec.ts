import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProjectAccessService } from './project-access.service';
import { ProjectsModule } from '../../projects/projects.module';
import { MonitoringModule } from '../../monitoring/monitoring.module';
import { ImplementationsModule } from '../../implementations/implementations.module';
import { DashboardModule } from '../../dashboard/dashboard.module';
import { User } from '../../users/schemas/user.schema';
import { Project } from '../../projects/schemas/project.schema';
import { ProjectShareLink } from '../../projects/schemas/project-share-link.schema';
import { ProjectConnection } from '../../monitoring/schemas/project-connection.schema';
import { MonitorCheck } from '../../monitoring/schemas/monitor-check.schema';
import { ProjectRepo } from '../../implementations/schemas/project-repo.schema';
import { ImplementationRun } from '../../implementations/schemas/implementation-run.schema';
import { Ticket } from '../../tickets/schemas/ticket.schema';
import { Attachment } from '../../attachments/schemas/attachment.schema';
import { AppSettings } from '../../app-settings/schemas/app-settings.schema';
import { Category } from '../../categories/schemas/category.schema';
import { Article } from '../../articles/schemas/article.schema';
import { Counter } from '../counters/counter.schema';
import { EncryptionModule } from '../encryption/encryption.module';
import configuration from '../../config/configuration';

const MODELS = [
  User.name,
  Project.name,
  ProjectShareLink.name,
  ProjectConnection.name,
  MonitorCheck.name,
  ProjectRepo.name,
  ImplementationRun.name,
  Ticket.name,
  Attachment.name,
  AppSettings.name,
  Counter.name,
  Category.name,
  Article.name,
];

function withMockedModels(builder: TestingModuleBuilder): TestingModuleBuilder {
  builder.overrideProvider(getConnectionToken()).useValue({});
  for (const model of MODELS) {
    builder
      .overrideProvider(getModelToken(model))
      .useValue({} as Model<unknown>);
  }
  return builder;
}

/**
 * Ver `users.module.spec.ts`: olvidarse de importar `ProjectAccessModule` en un módulo
 * que chequea permisos por proyecto no rompe la compilación, solo el arranque.
 */
describe('ProjectAccessModule', () => {
  it.each([
    ['ProjectsModule', ProjectsModule],
    ['MonitoringModule', MonitoringModule],
    ['ImplementationsModule', ImplementationsModule],
    ['DashboardModule', DashboardModule],
  ])('%s resuelve ProjectAccessService', async (_name, module) => {
    const moduleRef = await withMockedModels(
      Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
          // Global en la app real; acá hay que traerlo a mano.
          EncryptionModule,
          module,
        ],
      }),
    ).compile();

    expect(
      moduleRef.get(ProjectAccessService, { strict: false }),
    ).toBeInstanceOf(ProjectAccessService);
    await moduleRef.close();
  });
});
