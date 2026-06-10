import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');

  // CORS for local dev — Next.js at :3000 calls the API at :4000. Tighten
  // origin list in production. `x-org-id` is allowed for the Phase 1 tenant
  // placeholder header.
  app.enableCors({
    origin: ['http://localhost:3000'],
    credentials: true,
    allowedHeaders: ['content-type', 'authorization', 'x-org-id'],
  });

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  Logger.log(`ABM API listening on http://localhost:${port}`, 'Bootstrap');
}

bootstrap();
