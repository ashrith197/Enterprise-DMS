import { IsUUID, IsNotEmpty } from 'class-validator';

export class TransferOwnershipDto {
  @IsUUID()
  @IsNotEmpty()
  newOwnerUserId: string;
}
