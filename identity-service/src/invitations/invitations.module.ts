import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { Invitation } from '../entities/invitation.entity';
import { User } from '../entities/user.entity';
import { EmailModule } from '../email/email.module';
import { OrganizationClientService } from '../common/organization-client.service';

@Module({
  imports: [TypeOrmModule.forFeature([Invitation, User]), EmailModule, ConfigModule],
  controllers: [InvitationsController],
  providers: [InvitationsService, OrganizationClientService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
