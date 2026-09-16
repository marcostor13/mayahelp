import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TicketsModule } from './tickets.module';
import { TicketsService } from './tickets.service';
import { Ticket } from './schemas/ticket.schema';
import { Attachment } from '../attachments/schemas/attachment.schema';
import { User } from '../users/schemas/user.schema';
import { ProjectShareLink } from '../projects/schemas/project-share-link.schema';
import { Project } from '../projects/schemas/project.schema';
import { AppSettings } from '../app-settings/schemas/app-settings.schema';
import { Counter } from '../common/counters/counter.schema';
import { Category } from '../categories/schemas/category.schema';
import { Article } from '../articles/schemas/article.schema';
import configuration from '../config/configuration';

const MODELS = [
  Ticket.name,
  Attachment.name,
  User.name,
  ProjectShareLink.name,
  Project.name,
  AppSettings.name,
  Counter.name,
  Category.name,
  Article.name,
];

/** Ver `users.module.spec.ts`: cablear mal un módulo solo se nota al arrancar. */
describe('TicketsModule', () => {
  it('resuelve TicketsService con sus dependencias', async () => {
    const builder = Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        TicketsModule,
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

    expect(moduleRef.get(TicketsService)).toBeInstanceOf(TicketsService);
    await moduleRef.close();
  });
});
