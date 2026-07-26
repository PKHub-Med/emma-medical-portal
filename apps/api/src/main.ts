import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 3000;

  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
