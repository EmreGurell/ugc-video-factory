import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class RegisterTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsOptional()
  @IsIn(['android', 'ios'])
  platform?: string;
}
