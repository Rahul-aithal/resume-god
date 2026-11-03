import { IsNotEmpty, IsString } from "class-validator";

export class SwitchAccountDto {
  @IsString()
  @IsNotEmpty()
  user_id!: string;
}
