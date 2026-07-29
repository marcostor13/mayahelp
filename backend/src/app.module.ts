import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { TicketsModule } from './tickets/tickets.module';
import { ArticlesModule } from './articles/articles.module';
import { TasksModule } from './tasks/tasks.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { ExportModule } from './export/export.module';
import { AiModule } from './ai/ai.module';
import { ProjectsModule } from './projects/projects.module';
import { PublicModule } from './public/public.module';
import { SearchModule } from './search/search.module';
import { RelevanceModule } from './relevance/relevance.module';
import { WhatsAppTemplatesModule } from './whatsapp-templates/whatsapp-templates.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => ({ uri: process.env.MONGODB_URI }),
    }),
    // Baseline ceiling for every route. Endpoints that are cheap to abuse
    // (public observation links, login) declare their own tighter @Throttle.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    AuthModule,
    UsersModule,
    CategoriesModule,
    TicketsModule,
    ArticlesModule,
    TasksModule,
    DashboardModule,
    AttachmentsModule,
    ExportModule,
    AiModule,
    ProjectsModule,
    PublicModule,
    SearchModule,
    RelevanceModule,
    WhatsAppTemplatesModule,
  ],
  controllers: [AppController],
  providers: [
    // Throttling runs before auth so an unauthenticated flood is rejected
    // without ever touching the JWT strategy or the database.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
