import 'reflect-metadata';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AppLogger } from './common/logger/app-logger.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const logger = new AppLogger('Bootstrap');
  const app = await NestFactory.create(AppModule, { logger });

  const configService = app.get(ConfigService);

  app.use(helmet());
  // Required to read the HttpOnly refresh-token cookie on incoming requests
  // (req.cookies). Not using the signed-cookie variant — the refresh token
  // itself is already an unguessable, server-hashed secret; see
  // docs/architecture/security-architecture.md §1.1.
  app.use(cookieParser());

  const corsOrigins = (configService.get<string>('CORS_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
  });

  // Results in routes under /api/v1/* per prompts/13-api-contracts.md §2.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  const port = configService.get<number>('PORT') ?? 4000;
  await app.listen(port);
  logger.log(`CVLab AI API listening on port ${port} (base path: /api/v1)`);
}

bootstrap();
