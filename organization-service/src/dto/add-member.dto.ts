import { IsUUID, IsNotEmpty, IsEnum } from 'class-validator';
import { SystemRole } from '../entities/organization-member.entity';

export class AddMemberDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsEnum(SystemRole)
  @IsNotEmpty()
  systemRole: SystemRole;
}
