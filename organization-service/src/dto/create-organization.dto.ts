import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsUUID()
  @IsNotEmpty()
  ownerUserId: string;
}
