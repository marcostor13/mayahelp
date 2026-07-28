import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  // In Coolify every request arrives through Traefik, so without this `req.ip` is
  // the proxy's address for everyone and the rate limiter would throttle all users
  // as if they were one. Trust exactly one hop — trusting more would let a client
  // spoof its own address through X-Forwarded-For and bypass the limit entirely.
  app.set('trust proxy', 1);

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

  // Docs are served everywhere except production, where the schema of a private
  // support desk is not something to publish without an explicit decision.
  if (configService.get<string>('nodeEnv') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('MayaHelp API')
      .setDescription('API de la mesa de ayuda MayaHelp')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      'api/docs',
      app,
      SwaggerModule.createDocument(app, config),
    );
  }

  await app.listen(configService.get<number>('port') ?? 3000);
}
void bootstrap();
