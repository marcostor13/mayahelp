import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setServers } from 'node:dns';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

function configureDns(): void {
  const servers = (process.env.NODE_DNS_SERVERS ?? '')
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);

  if (servers.length > 0) {
    setServers(servers);
  }
}

async function bootstrap() {
  // Must run before NestFactory.create, so the mongodb+srv:// DNS lookup
  // (done during MongooseModule connection setup) uses these resolvers
  // instead of a system default that may not resolve Atlas SRV records.
  configureDns();

  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.use(helmet());
  app.enableCors({
    origin: configService.get<string>('corsOrigin'),
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(configService.get<number>('port') ?? 3000);
}
void bootstrap();
