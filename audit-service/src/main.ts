import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { HttpExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = process.env.PORT || 3008;
  await app.listen(port);
  
  logger.log(`🚀 audit-service running on port ${port}`, 'Bootstrap');
}
bootstrap();
