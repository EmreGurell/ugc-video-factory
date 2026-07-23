import { IsEmail, IsOptional, IsIn } from 'class-validator';

export class InviteMemberDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsIn(['owner', 'member'])
  role?: 'owner' | 'member';
}
