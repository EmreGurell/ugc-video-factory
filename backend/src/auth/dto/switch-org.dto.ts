import { IsString, IsNotEmpty } from 'class-validator';

export class SwitchOrgDto {
  @IsString()
  @IsNotEmpty()
  organization_id: string;
}
