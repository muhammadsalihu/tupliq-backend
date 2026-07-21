import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // contentSecurityPolicy is disabled because its default script-src blocks
  // Swagger UI's inline bootstrap script (served below at /docs) — this API
  // otherwise only returns JSON, so there's no HTML surface left to protect.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

  const corsOrigins = (process.env.CORS_ORIGINS ?? '*').split(',').map((o) => o.trim());
  app.enableCors({ origin: corsOrigins.includes('*') ? true : corsOrigins });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Tupliq API')
    .setDescription(
      'REST API for the Tupliq app — auth, user profiles, hackathons, and invite-code redemption.',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .addApiKey({ type: 'apiKey', name: 'x-admin-key', in: 'header' }, 'admin-key')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port, '0.0.0.0');
}

bootstrap();
