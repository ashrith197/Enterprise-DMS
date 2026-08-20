import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.useGlobalFilters(new HttpExceptionFilter());

  // Set up gRPC microservice
  const grpcPort = process.env.GRPC_PORT || 5002;
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'organization',
      protoPath: join(__dirname, '../proto/organization.proto'),
      url: `0.0.0.0:${grpcPort}`,
    },
  });

  await app.startAllMicroservices();
  logger.log(`🔌 gRPC server running on port ${grpcPort}`, 'Bootstrap');

  const port = process.env.PORT || 3002;
  await app.listen(port);
  
  logger.log(`🚀 Organization service running on HTTP port ${port}`, 'Bootstrap');
}
bootstrap();

