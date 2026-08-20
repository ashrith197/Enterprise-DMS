import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from './common/logger.module';
import { Organization } from './entities/organization.entity';
import { OrganizationMember } from './entities/organization-member.entity';
import { BranchAdminHistory } from './entities/branch-admin-history.entity';
import { OrganizationController } from './controllers/organization.controller';
import { OrganizationGrpcController } from './controllers/organization-grpc.controller';
import { OrganizationService } from './services/organization.service';
import { IdentityClientService } from './services/identity-client.service';
import { EventService } from './services/event.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule,
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        entities: [Organization, OrganizationMember, BranchAdminHistory],
        synchronize: false, // NEVER use synchronize:true in team workflow
        logging: false,
      }),
    }),
    TypeOrmModule.forFeature([
      Organization,
      OrganizationMember,
      BranchAdminHistory,
    ]),
  ],
  controllers: [OrganizationController, OrganizationGrpcController],
  providers: [OrganizationService, IdentityClientService, EventService],
})
export class AppModule {}

