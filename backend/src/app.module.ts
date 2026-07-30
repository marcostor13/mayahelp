import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_GUARD } from '@nestjs/core';
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
import { WhatsAppTemplatesModule } from './whatsapp-templates/whatsapp-templates.module';
import { AppSettingsModule } from './app-settings/app-settings.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { ImplementationsModule } from './implementations/implementations.module';
import { EncryptionModule } from './common/encryption/encryption.module';

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
    WhatsAppTemplatesModule,
    AppSettingsModule,
    MonitoringModule,
    ImplementationsModule,
    EncryptionModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
