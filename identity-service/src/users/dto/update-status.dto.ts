import { IsEnum, IsNotEmpty } from 'class-validator';
import { UserStatus } from '../../entities/user-status.enum';

export class UpdateStatusDto {
  @IsEnum(UserStatus, {
    message: 'Status must be one of: ACTIVE, DISABLED, DELETED',
  })
  @IsNotEmpty({ message: 'Status is required' })
  status: UserStatus.ACTIVE | UserStatus.DISABLED | UserStatus.DELETED;
}
