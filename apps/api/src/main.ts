import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  Logger.log(`ABM API listening on http://localhost:${port}`, 'Bootstrap');
}

bootstrap();
