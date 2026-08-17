import { IsEmail, IsEnum, IsUUID, IsOptional } from 'class-validator';
import { InvitationRole } from '../../entities/invitation-role.enum';

export class CreateInvitationDto {
  @IsUUID()
  organizationId: string;

  @IsEmail()
  email: string;

  @IsEnum(InvitationRole)
  role: InvitationRole;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
