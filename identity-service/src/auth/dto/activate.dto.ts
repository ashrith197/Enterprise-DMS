import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class ActivateDto {
  @IsString()
  @IsNotEmpty({ message: 'Token is required' })
  token: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/.*\d.*/, {
    message: 'Password must contain at least one number',
  })
  @IsNotEmpty({ message: 'Password is required' })
  password: string;
}
