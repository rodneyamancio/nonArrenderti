import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadEnv } from './config/env.schema';

export async function createApp(): Promise<NestExpressApplication> {
  const env = loadEnv(); // fails fast on invalid/placeholder config
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: env.LOG_LEVEL === 'debug' ? ['error', 'warn', 'log', 'debug'] : env.LOG_LEVEL === 'log' ? ['error', 'warn', 'log'] : [env.LOG_LEVEL, 'error'],
  });
  // nginx → web (Next proxy) → api. Without this req.ip is the proxy and rate limits collapse into one bucket.
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '256kb' });
  // Photos and receipts arrive as raw image bytes (already resized by the client).
  app.useBodyParser('raw', { type: ['image/jpeg', 'image/png', 'image/webp'], limit: '6mb' });
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  app.enableShutdownHooks();
  return app;
}

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const env = loadEnv();
  // No CORS: browsers talk to the web origin, which proxies /api here. Mobile uses Bearer tokens.
  await app.listen(env.PORT, '0.0.0.0');
  Logger.log(`API listening on :${env.PORT}`, 'Bootstrap');
}

if (require.main === module) void bootstrap();
