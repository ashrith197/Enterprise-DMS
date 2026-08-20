import { IsEnum, IsNotEmpty } from 'class-validator';
import { SystemRole } from '../entities/organization-member.entity';

export class UpdateMemberRoleDto {
  @IsEnum(SystemRole)
  @IsNotEmpty()
  systemRole: SystemRole;
}
