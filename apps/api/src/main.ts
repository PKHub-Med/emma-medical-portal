import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { corsOptions } from './cors.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 3000;

  app.enableCors(corsOptions());
  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
