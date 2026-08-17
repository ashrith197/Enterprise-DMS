import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { InvitationStatus } from '../../entities/invitation-status.enum';

export class QueryInvitationsDto {
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsEnum(InvitationStatus)
  status?: InvitationStatus;
}
